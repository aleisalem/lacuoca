"""
OCR service — two-step pipeline:
  1. Vision extraction: either a vision LLM (ollama | openai | anthropic) or
     PaddleOCR (provider="paddle") reads the image and produces a clean,
     complete plain-text transcription of all visible content.
  2. Chat/generation LLM (ocr_structure_provider/model): parses the transcribed
     text into structured recipe JSON.

Each step's provider and model are configured independently through AI Settings.
If step 1 fails, step 2 receives an empty string (graceful degradation).
If step 2 fails, the heuristic parser is applied to whatever text is available.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import re
from typing import Any, TYPE_CHECKING

from PIL import Image

from app.config import get_settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()
logger = logging.getLogger("lacuoca.ocr")

# ── Step 1a: PaddleOCR — local, no AI model required ────────────────────────

# Maps the app's language codes to PaddleOCR language identifiers
_PADDLE_LANG_MAP: dict[str, str] = {
    "eng": "en",
    "deu": "german",
    "eng+deu": "en",  # PaddleOCR doesn't mix two languages; fall back to English
}

# Module-level cache so the model is loaded only once per language
_paddle_cache: dict[str, Any] = {}


def _get_paddle_ocr(lang: str) -> Any:
    if lang not in _paddle_cache:
        try:
            from paddleocr import PaddleOCR
        except ImportError as exc:
            raise RuntimeError(
                "PaddleOCR is not installed. Add 'paddlepaddle' and 'paddleocr' to requirements.txt."
            ) from exc
        # show_log=False silences PaddleOCR's verbose initialization output
        _paddle_cache[lang] = PaddleOCR(use_angle_cls=True, lang=lang, show_log=False)
    return _paddle_cache[lang]


async def _extract_text_via_paddle(
    image_bytes: bytes,
    language: str,
    model_override: str = "",
) -> str:
    """
    Use PaddleOCR to extract text from the image.

    The model_override field (from the admin "Model" input) can contain a
    PaddleOCR language code (e.g. "en", "german") to override the default
    mapping from the recipe language selector.  Leave blank to use the default.

    Runs in a thread executor to avoid blocking the async event loop.
    PaddleOCR downloads model weights (~50 MB) on the first call per language.
    """
    import numpy as np

    paddle_lang = model_override.strip() or _PADDLE_LANG_MAP.get(language, "en")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img_array = np.array(img)

    def _run():
        ocr = _get_paddle_ocr(paddle_lang)
        return ocr.ocr(img_array, cls=True)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run)

    if not result:
        return ""

    # result is a list of pages; each page is a list of [box, [text, confidence]]
    lines: list[tuple[float, str]] = []
    for page in result:
        if not page:
            continue
        for item in page:
            box, text_info = item
            text = text_info[0] if isinstance(text_info, (list, tuple)) else text_info
            y_top = float(box[0][1])
            lines.append((y_top, text))

    lines.sort(key=lambda x: x[0])
    return "\n".join(t for _, t in lines)


# ── Step 1b: vision LLM — pure text transcription ────────────────────────────

_LANG_HINT = {
    "eng": "English",
    "deu": "German",
    "eng+deu": "English or German",
}


def _build_vision_message(mime: str, b64: str, text: str, provider: str):
    """Build a LangChain HumanMessage with an image for the given provider."""
    from langchain_core.messages import HumanMessage

    if provider == "anthropic":
        # Anthropic expects {"type": "image", "source": {...}}
        return HumanMessage(content=[
            {
                "type": "image",
                "source": {"type": "base64", "media_type": mime, "data": b64},
            },
            {"type": "text", "text": text},
        ])
    else:
        # OpenAI and Ollama both use the image_url format
        return HumanMessage(content=[
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            {"type": "text", "text": text},
        ])


async def _extract_text_via_vision(
    image_bytes: bytes,
    language: str,
    cfg: dict[str, str],
    vision_prompt: str,
) -> str:
    """Send the image to the vision LLM; return a clean plain-text transcription."""
    provider = cfg["ocr_vision_provider"]
    model = cfg["ocr_vision_model"]
    lang_hint = _LANG_HINT.get(language, "English")

    img = Image.open(io.BytesIO(image_bytes))
    fmt = (img.format or "JPEG").lower()
    mime = f"image/{'jpeg' if fmt in ('jpg', 'jpeg') else fmt}"
    b64 = base64.b64encode(image_bytes).decode()

    prompt_text = vision_prompt.format(language=lang_hint)
    message = _build_vision_message(mime, b64, prompt_text, provider)

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model=model,
            api_key=cfg["openai_api_key"] or settings.OPENAI_API_KEY,
            temperature=0,
            max_tokens=2048,
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=model,
            api_key=cfg["anthropic_api_key"] or settings.ANTHROPIC_API_KEY,
            temperature=0,
            max_tokens=2048,
        )
    else:
        from langchain_ollama import ChatOllama
        llm = ChatOllama(
            model=model,
            base_url=cfg["ollama_base_url"],
            temperature=0,
            think=False,
            num_predict=1500,
        )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: llm.invoke([message]))
    return response.content.strip()


# ── Step 2: chat/generation LLM — JSON structuring ───────────────────────────


async def _structure_via_chat(
    extracted_text: str,
    cfg: dict[str, str],
    structuring_prompt: str,
) -> dict[str, Any]:
    """Send the transcribed recipe text to the structuring LLM; return parsed JSON."""
    from langchain_core.messages import HumanMessage

    provider = cfg["ocr_structure_provider"]
    model = cfg["ocr_structure_model"]
    prompt_text = structuring_prompt.format(extracted_text=extracted_text)

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(
            model=model,
            api_key=cfg["openai_api_key"] or settings.OPENAI_API_KEY,
            temperature=0,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
    elif provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        llm = ChatAnthropic(
            model=model,
            api_key=cfg["anthropic_api_key"] or settings.ANTHROPIC_API_KEY,
            temperature=0,
            max_tokens=4096,
        )
    else:
        from langchain_ollama import ChatOllama
        llm = ChatOllama(
            model=model,
            base_url=cfg["ollama_base_url"],
            temperature=0,
            think=False,
            format="json",
            num_predict=4096,
        )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: llm.invoke([HumanMessage(content=prompt_text)]),
    )
    content = response.content.strip()

    # Strip markdown code fences if the model added them
    if content.startswith("```"):
        content = re.sub(r"^```[a-z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)

    return json.loads(content)


# ── Heuristic fallback (applied if the chat LLM fails) ───────────────────────

UNIT_RE = re.compile(
    r"\b(g|kg|ml|l|dl|cl|oz|lb|cup|cups|tbsp|tsp|teaspoon|tablespoon|"
    r"pinch|bunch|slice|slices|piece|pieces|clove|cloves|"
    r"gramm|kilogramm|milliliter|liter|esslöffel|teelöffel|tasse|prise|scheibe|"
    r"bund|zehe|zehen|stück|stücke|dose|pkg|pkt|packet)\b",
    re.IGNORECASE,
)
NUMBER_RE = re.compile(r"^[\d¼½¾⅓⅔⅛⅜⅝⅞]+([.,]\d+)?")
NUMBER_ANYWHERE_RE = re.compile(r"\b\d+([.,]\d+)?\b")
STEP_PREFIX_RE = re.compile(
    r"^(\d+[.)]\s+|(?:schritt|step)\s*\d*[:.]?\s*)", re.IGNORECASE
)
HEADER_RE = re.compile(
    r"^(zutaten|ingredients?|zubereitung|preparation|method|directions?|anleitung|rezept|recipe)\s*:?\s*$",
    re.IGNORECASE,
)


def _to_float(s: str) -> float | None:
    try:
        return float(s.replace(",", "."))
    except (ValueError, AttributeError):
        return None


def _parse_ingredient(line: str) -> dict | None:
    num_match = NUMBER_RE.match(line)
    if num_match:
        qty_str = num_match.group(0)
        remainder = line[len(qty_str):].strip()
        unit_match = UNIT_RE.match(remainder)
        if unit_match:
            unit = unit_match.group(0)
            name = remainder[len(unit):].strip().lstrip(",").strip()
            if name:
                return {"name": name, "quantity": _to_float(qty_str), "unit": unit, "order": 0}

    unit_match = UNIT_RE.search(line)
    num_match2 = NUMBER_ANYWHERE_RE.search(line)
    if unit_match and num_match2:
        name = line[: num_match2.start()].strip().rstrip(",").strip()
        if not name:
            name = line[unit_match.end():].strip().lstrip(",").strip()
        if name:
            return {"name": name, "quantity": _to_float(num_match2.group(0)),
                    "unit": unit_match.group(0), "order": 0}

    if unit_match and len(line) < 80:
        name = UNIT_RE.sub("", line).strip().strip(",").strip()
        if name:
            return {"name": name, "quantity": None, "unit": unit_match.group(0), "order": 0}

    return None


def _parse_lines(raw_text: str) -> dict[str, Any]:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    ingredients: list[dict] = []
    steps: list[dict] = []
    step_order = 1
    in_steps_section = False

    for line in lines:
        if len(line) < 3:
            continue
        if HEADER_RE.match(line):
            if any(w in line.lower() for w in ("zubereitung", "preparation", "method", "direction")):
                in_steps_section = True
            else:
                in_steps_section = False
            continue
        if STEP_PREFIX_RE.match(line):
            text = STEP_PREFIX_RE.sub("", line).strip()
            if text:
                steps.append({"order": step_order, "description": text})
                step_order += 1
            continue
        if not in_steps_section and UNIT_RE.search(line) and NUMBER_ANYWHERE_RE.search(line) and len(line) < 150:
            ing = _parse_ingredient(line)
            if ing:
                ingredients.append(ing)
                continue
        if in_steps_section or len(line) > 40:
            steps.append({"order": step_order, "description": line})
            step_order += 1

    for i, ing in enumerate(ingredients):
        ing["order"] = i
    for i, step in enumerate(steps):
        step["order"] = i + 1

    title = ""
    for line in lines[:6]:
        if 4 < len(line) < 100 and not UNIT_RE.search(line) and not NUMBER_RE.match(line):
            title = line
            break

    return {"raw_text": raw_text, "title": title, "ingredients": ingredients, "steps": steps}


# ── Public API ────────────────────────────────────────────────────────────────

async def extract_recipe_from_image(
    image_bytes: bytes,
    language: str = "eng",
    db: "AsyncSession | None" = None,
) -> dict[str, Any]:
    """
    Extract recipe data from an image using the two-step pipeline:
      Step 1 — Vision LLM transcribes the image to plain text.
      Step 2 — Structuring LLM parses the text into structured recipe JSON.
    """
    if db is not None:
        from app.services.settings_service import get_ai_config, get_prompt_config
        cfg = await get_ai_config(db)
        prompt_cfg = await get_prompt_config(db)
    else:
        from app.prompts import PROMPT_DEFAULTS
        cfg = {
            "ocr_vision_provider": "ollama",
            "ocr_vision_model": settings.OLLAMA_VISION_MODEL,
            "ocr_structure_provider": settings.AI_PROVIDER,
            "ocr_structure_model": settings.OLLAMA_CHAT_MODEL or settings.OLLAMA_MODEL,
            "ollama_base_url": settings.OLLAMA_BASE_URL,
            "openai_api_key": settings.OPENAI_API_KEY,
            "anthropic_api_key": settings.ANTHROPIC_API_KEY,
        }
        prompt_cfg = PROMPT_DEFAULTS

    # Step 1: image → plain text (PaddleOCR or vision LLM)
    try:
        if cfg["ocr_vision_provider"] == "paddle":
            extracted_text = await _extract_text_via_paddle(
                image_bytes, language, cfg.get("ocr_vision_model", "")
            )
            logger.info("PaddleOCR transcribed %d chars", len(extracted_text))
        else:
            extracted_text = await _extract_text_via_vision(
                image_bytes, language, cfg, prompt_cfg["prompt_ocr_vision"]
            )
            logger.info(
                "Vision LLM (%s/%s) transcribed %d chars",
                cfg["ocr_vision_provider"], cfg["ocr_vision_model"], len(extracted_text),
            )
    except Exception as e:
        logger.warning("Vision extraction failed (%s), using empty text", e)
        extracted_text = ""

    # Step 2: structuring LLM → JSON
    try:
        result = await _structure_via_chat(extracted_text, cfg, prompt_cfg["prompt_ocr_structure"])
        result.setdefault("raw_text", extracted_text)
        result.setdefault("title", "")
        result.setdefault("ingredients", [])
        result.setdefault("steps", [])
        logger.info(
            "Structuring LLM (%s/%s): %d ingredients, %d steps",
            cfg["ocr_structure_provider"], cfg["ocr_structure_model"],
            len(result["ingredients"]), len(result["steps"]),
        )
        return result
    except Exception as e:
        logger.warning("Structuring LLM failed (%s), using heuristic parser", e)
        return _parse_lines(extracted_text)
