"""
AI service — handles semantic search, recipe generation, and agent chat.

Each role has its own provider + model configured independently:
  chat_provider / chat_model           — recipe generation, chat, URL import
  embedding_provider / embedding_model — semantic search embeddings

Supported providers: "ollama" | "openai" | "anthropic"
  - "ollama"     → uses Ollama (local or remote via ollama_base_url)
  - "openai"     → uses OpenAI API
  - "anthropic"  → uses Anthropic API

RAG pipeline:
  1. On recipe create/update, generate an embedding and store in the recipes.embedding column.
  2. On AI search, embed the query and do cosine similarity search via pgvector.
  3. For generation / chat, inject retrieved context into the prompt.
"""
from __future__ import annotations

import json
import logging
from typing import Any, TYPE_CHECKING

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.config import get_settings
from app.services.settings_service import get_ai_config, get_prompt_config

if TYPE_CHECKING:
    from app.models.recipe import Recipe

settings = get_settings()
logger = logging.getLogger("lacuoca.ai")


# ── LLM + Embeddings factory ──────────────────────────────────────────────────

def _get_llm(cfg: dict[str, str], temperature: float = 0.7):
    provider = cfg["chat_provider"]
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=cfg["chat_model"],
            api_key=cfg["openai_api_key"] or settings.OPENAI_API_KEY,
            temperature=temperature,
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model=cfg["chat_model"],
            api_key=cfg["anthropic_api_key"] or settings.ANTHROPIC_API_KEY,
            temperature=temperature,
        )
    else:
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=cfg["chat_model"],
            base_url=cfg["ollama_base_url"],
            temperature=temperature,
        )


def _get_embeddings(cfg: dict[str, str]):
    provider = cfg["embedding_provider"]
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            model=cfg["embedding_model"],
            api_key=cfg["openai_api_key"] or settings.OPENAI_API_KEY,
        )
    else:
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(
            model=cfg["embedding_model"],
            base_url=cfg["ollama_base_url"],
        )


def _recipe_to_text(recipe: "Recipe") -> str:
    """Convert a recipe ORM object into a plain-text representation for embedding."""
    parts = [f"Title: {recipe.title}"]
    if recipe.description:
        parts.append(f"Description: {recipe.description}")
    if recipe.tags:
        parts.append(f"Tags: {recipe.tags}")
    parts.append(f"Category: {recipe.category}")

    if recipe.ingredients:
        ing_lines = []
        for ing in recipe.ingredients:
            qty = f"{ing.quantity} {ing.unit}" if ing.quantity else ""
            ing_lines.append(f"{qty} {ing.name}".strip())
        parts.append("Ingredients: " + ", ".join(ing_lines))

    if recipe.steps:
        step_lines = [f"{s.order}. {s.description}" for s in recipe.steps]
        parts.append("Steps: " + " ".join(step_lines))

    return "\n".join(parts)


# ── Indexing ──────────────────────────────────────────────────────────────────

async def index_recipe(recipe: "Recipe", db: AsyncSession) -> None:
    """Generate embedding for a recipe and persist it."""
    try:
        cfg = await get_ai_config(db)
        text_repr = _recipe_to_text(recipe)
        embeddings = _get_embeddings(cfg)
        vector = await embeddings.aembed_query(text_repr)

        # Serialize as JSON string — pgvector accepts "[0.1, 0.2, ...]" format
        await db.execute(
            text("UPDATE recipes SET embedding = :vec WHERE id = :id"),
            {"vec": json.dumps(vector), "id": recipe.id},
        )
        logger.info(
            "Indexed recipe %s (%s) — %d-dim embedding via %s/%s",
            recipe.id, recipe.title, len(vector), cfg["embedding_provider"], cfg["embedding_model"],
        )
    except Exception as exc:
        logger.warning("Embedding failed for recipe %s: %s", recipe.id, exc)


async def index_recipe_background(recipe_id: str) -> None:
    """
    Standalone background task — creates its own DB session so it can run
    after the HTTP response has already been sent (FastAPI BackgroundTasks).
    """
    from app.database import AsyncSessionLocal
    from app.models.recipe import Recipe as RecipeModel
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(RecipeModel)
                .options(
                    selectinload(RecipeModel.ingredients),
                    selectinload(RecipeModel.steps),
                )
                .where(RecipeModel.id == recipe_id)
            )
            recipe = result.scalar_one_or_none()
            if recipe:
                await index_recipe(recipe, db)
                await db.commit()
        except Exception as exc:
            logger.warning("Background indexing failed for recipe %s: %s", recipe_id, exc)


# ── Semantic Search ───────────────────────────────────────────────────────────

# Minimum cosine similarity to consider a result relevant.
# score = 1 - cosine_distance, range [-1, 1].
# Results below this threshold are dropped rather than returned as false positives.
MIN_SIMILARITY_SCORE = 0.3


async def search_recipes_ai(query: str, user_id: str, db: AsyncSession) -> list[dict]:
    """Return the most semantically similar recipes for the given user.

    Only returns results that score at least MIN_SIMILARITY_SCORE so that
    queries with no good matches return an empty list instead of unrelated recipes.
    """
    try:
        cfg = await get_ai_config(db)
        embeddings = _get_embeddings(cfg)
        query_vec = await embeddings.aembed_query(query)

        # Fetch the top-10 candidates then apply the score threshold in Python.
        # Fetching a larger candidate set first ensures we don't miss good matches
        # that happen to sit just above the threshold.
        rows = await db.execute(
            text("""
                SELECT id, title, description, category, tags,
                       1 - (embedding <=> CAST(:vec AS vector)) AS score
                FROM recipes
                WHERE owner_id = :user_id
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:vec AS vector)
                LIMIT 10
            """),
            {"vec": json.dumps(query_vec), "user_id": user_id},
        )

        results = []
        for row in rows.mappings():
            score = round(float(row["score"]), 4)
            logger.debug(
                "AI search '%s' → '%s' score=%.3f", query, row["title"], score
            )
            if score < MIN_SIMILARITY_SCORE:
                continue
            results.append({
                "id": row["id"],
                "title": row["title"],
                "description": row["description"],
                "category": row["category"],
                "tags": row["tags"],
                "score": score,
            })

        logger.info(
            "AI search '%s': %d result(s) above threshold %.2f",
            query, len(results), MIN_SIMILARITY_SCORE,
        )
        return results[:5]
    except Exception as e:
        logger.warning("AI search failed: %s", e)
        return [{"error": str(e)}]


# ── Recipe Generation ─────────────────────────────────────────────────────────


def _extract_json(content: str) -> str:
    """
    Extract a JSON object from an LLM response.

    Handles raw JSON, ```json fences, preamble text, and trailing commentary.
    Uses first-{ / last-} rather than a regex so nested objects (ingredients,
    steps) are never truncated.
    """
    content = content.strip()
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end > start:
        return content[start : end + 1]
    return content  # let json.loads raise a clear error


async def generate_recipe_ai(
    prompt: str, servings: int | None, unit_system: str, db: AsyncSession
) -> tuple[dict[str, Any], str]:
    """Returns (recipe_dict, model_name)."""
    cfg = await get_ai_config(db)
    prompts = await get_prompt_config(db)
    llm = _get_llm(cfg)
    model_name = cfg["chat_model"]
    full_prompt = prompts["prompt_recipe_generate"].format(
        prompt=prompt, servings=servings or 4, unit_system=unit_system
    )
    response = await llm.ainvoke(full_prompt)
    raw = response.content
    logger.debug("generate_recipe_ai raw response (%d chars): %.500s", len(raw), raw)
    content = _extract_json(raw)
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.error(
            "generate_recipe_ai JSON parse failed.\nExtracted: %.500s\nError: %s",
            content, exc,
        )
        raise

    # Normalize tags: LLMs sometimes return a list instead of a comma-separated string.
    if isinstance(data.get("tags"), list):
        data["tags"] = ",".join(str(t) for t in data["tags"])

    return data, model_name


# ── URL Import ────────────────────────────────────────────────────────────────

def _extract_jsonld_recipe(soup: "Any") -> dict[str, Any] | None:
    """Return the first schema.org Recipe object found in JSON-LD script tags, or None."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            blob = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue

        candidates = []
        if isinstance(blob, list):
            candidates = blob
        elif isinstance(blob, dict):
            if blob.get("@type") in ("Recipe", ["Recipe"]):
                candidates = [blob]
            else:
                candidates = blob.get("@graph", [])

        for item in candidates:
            if not isinstance(item, dict):
                continue
            item_type = item.get("@type", "")
            if item_type == "Recipe" or (isinstance(item_type, list) and "Recipe" in item_type):
                return item

    return None


async def import_recipe_from_url(url: str, db: AsyncSession) -> tuple[dict[str, Any], str]:
    """Fetch a web page, extract recipe content, and normalise it via the LLM.

    Prefers schema.org JSON-LD structured data when present (most recipe sites);
    falls back to scraped visible text.  Either way the content is passed through
    the configured LLM so units are normalised and the output is consistent.

    Returns (recipe_dict, model_name).
    """
    import httpx
    from bs4 import BeautifulSoup

    async with httpx.AsyncClient(follow_redirects=True, timeout=20, verify=False) as client:
        try:
            response = await client.get(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/124.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
        except httpx.ConnectError as exc:
            raise ValueError(f"Could not connect to URL: {exc}") from exc
        except httpx.TimeoutException as exc:
            raise ValueError(f"Request timed out: {exc}") from exc
        except httpx.RequestError as exc:
            raise ValueError(f"Could not fetch URL: {exc}") from exc

    if not response.text.strip():
        raise ValueError("The page returned no content")

    logger.info(
        "import_recipe_from_url fetched %s — status %d, %d chars",
        url, response.status_code, len(response.text),
    )

    soup = BeautifulSoup(response.text, "html.parser")

    jsonld = _extract_jsonld_recipe(soup)
    if jsonld:
        logger.info("import_recipe_from_url: using JSON-LD structured data for %s", url)
        page_text = json.dumps(jsonld, ensure_ascii=False, indent=2)
    else:
        logger.info("import_recipe_from_url: no JSON-LD found, scraping visible text for %s", url)
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form", "noscript"]):
            tag.decompose()
        container = soup.find("main") or soup.find("article") or soup.find("body")
        page_text = container.get_text(separator="\n", strip=True) if container else soup.get_text(separator="\n", strip=True)
        page_text = page_text[:12000]

    logger.debug("import_recipe_from_url page_text preview: %.500s", page_text)

    cfg = await get_ai_config(db)
    prompts = await get_prompt_config(db)
    llm = _get_llm(cfg)
    model_name = cfg["chat_model"]

    full_prompt = prompts["prompt_url_import"].format(page_text=page_text)
    response_msg = await llm.ainvoke(full_prompt)
    raw = response_msg.content
    logger.debug("import_recipe_from_url raw response (%d chars): %.500s", len(raw), raw)

    content = _extract_json(raw)
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        logger.error(
            "import_recipe_from_url JSON parse failed.\nExtracted: %.500s\nError: %s",
            content, exc,
        )
        raise

    if isinstance(data.get("tags"), list):
        data["tags"] = ",".join(str(t) for t in data["tags"])

    return data, model_name


# ── Background URL Import ─────────────────────────────────────────────────────

_import_tasks: dict[str, dict[str, Any]] = {}


async def _run_import_task(task_id: str, url: str) -> None:
    from app.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as db:
            data, model_name = await import_recipe_from_url(url, db)
        _import_tasks[task_id] = {"status": "done", "result": {**data, "_ai_model": model_name}}
        logger.info("Background URL import completed for task %s", task_id)
    except Exception as exc:
        logger.warning("Background URL import failed for task %s: %s", task_id, exc)
        _import_tasks[task_id] = {"status": "error", "error": str(exc)}


def start_import_task(url: str) -> str:
    """Schedule an async URL import in the background and return the task ID."""
    import asyncio
    import uuid
    task_id = str(uuid.uuid4())
    _import_tasks[task_id] = {"status": "pending"}
    asyncio.create_task(_run_import_task(task_id, url))
    return task_id


def get_import_task(task_id: str) -> dict[str, Any] | None:
    return _import_tasks.get(task_id)


# ── Chat Agent ────────────────────────────────────────────────────────────────

async def chat_with_agent(
    message: str,
    history: list[dict],
    user_id: str,
    db: AsyncSession,
) -> tuple[str, str]:
    """Returns (response_text, model_name)."""
    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

    cfg = await get_ai_config(db)
    prompts = await get_prompt_config(db)
    llm = _get_llm(cfg)
    model_name = cfg["chat_model"]

    messages = [SystemMessage(content=prompts["prompt_chat_system"])]
    for h in history[-10:]:  # keep last 10 turns
        if h.get("role") == "user":
            messages.append(HumanMessage(content=h["content"]))
        elif h.get("role") == "assistant":
            messages.append(AIMessage(content=h["content"]))

    messages.append(HumanMessage(content=message))

    response = await llm.ainvoke(messages)
    return response.content, model_name


async def stream_chat_with_agent(
    message: str,
    history: list[dict],
    db: AsyncSession,
):
    """Async generator that yields SSE lines for the chat response.

    Yields JSON-encoded chunks of the form:
      {"type": "thinking", "content": "..."}  — thinking tokens (if model supports <think>)
      {"type": "token", "content": "..."}     — response tokens
      {"type": "done", "model": "..."}        — signals completion with model name
      {"type": "error", "content": "..."}     — on failure
    """
    import re
    from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

    cfg = await get_ai_config(db)
    prompts = await get_prompt_config(db)
    llm = _get_llm(cfg)
    model_name = cfg["chat_model"]

    msgs = [SystemMessage(content=prompts["prompt_chat_system"])]
    for h in history[-10:]:
        if h.get("role") == "user":
            msgs.append(HumanMessage(content=h["content"]))
        elif h.get("role") == "assistant":
            msgs.append(AIMessage(content=h["content"]))
    msgs.append(HumanMessage(content=message))

    # Buffer to detect <think>...</think> blocks emitted by reasoning models (e.g. qwen3)
    buffer = ""
    in_think = False
    think_closed = False

    try:
        async for chunk in llm.astream(msgs):
            token: str = chunk.content  # type: ignore[attr-defined]
            if not token:
                continue

            if not think_closed:
                buffer += token
                # Check for opening <think> tag
                if not in_think and "<think>" in buffer:
                    in_think = True
                    # Emit anything before the tag as a regular token first
                    pre, _, rest = buffer.partition("<think>")
                    buffer = rest
                    if pre.strip():
                        yield f"data: {json.dumps({'type': 'token', 'content': pre})}\n\n"
                    continue

                if in_think:
                    if "</think>" in buffer:
                        think_content, _, after = buffer.partition("</think>")
                        buffer = after
                        in_think = False
                        think_closed = True
                        if think_content.strip():
                            yield f"data: {json.dumps({'type': 'thinking', 'content': think_content})}\n\n"
                        # Flush remaining as token
                        if buffer:
                            yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
                            buffer = ""
                    else:
                        # Still inside <think> — keep buffering (don't yield yet)
                        pass
                    continue

                # No think block started — flush buffer as token
                yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
                buffer = ""
            else:
                yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        # Flush any remaining buffer after stream ends
        if buffer and not in_think:
            yield f"data: {json.dumps({'type': 'token', 'content': buffer})}\n\n"
        elif buffer and in_think:
            # Model ended without closing </think> — treat all as thinking
            yield f"data: {json.dumps({'type': 'thinking', 'content': buffer})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'model': model_name})}\n\n"
    except Exception as exc:
        logger.warning("stream_chat_with_agent error: %s", exc)
        yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"
