"""
Settings service — provides a merged view of DB-persisted admin settings
layered on top of env-var defaults.

Each AI role (chat, embedding, ocr_vision, ocr_structure) has its own
provider + model setting so they can be mixed and matched independently.

Caching: settings are loaded from the DB on first use and cached in memory.
The cache is invalidated whenever an admin saves changes through the API.
On a single-worker deployment (the typical Docker Compose setup) this is
sufficient; for multi-worker deployments the cache will be eventually
consistent across workers (next request after an update will reload).
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings

_cache: dict[str, str] | None = None


def invalidate_cache() -> None:
    global _cache
    _cache = None


async def _load_cache(db: AsyncSession) -> dict[str, str]:
    global _cache
    if _cache is None:
        from app.models.settings import SystemSetting
        rows = await db.execute(select(SystemSetting))
        _cache = {r.key: r.value for r in rows.scalars()}
    return _cache


def _resolve_model(
    provider: str,
    ollama_fallback: str,
    openai_fallback: str,
    anthropic_fallback: str,
) -> str:
    if provider == "openai":
        return openai_fallback
    if provider == "anthropic":
        return anthropic_fallback
    return ollama_fallback


async def get_ai_config(db: AsyncSession) -> dict[str, str]:
    """
    Return the effective per-role AI configuration dict.

    New keys (take precedence over legacy keys when present in DB):
      chat_provider / chat_model           — recipe generation, chat, URL import
      embedding_provider / embedding_model — semantic search embeddings
      ocr_vision_provider / ocr_vision_model     — OCR step 1: image → text
      ocr_structure_provider / ocr_structure_model — OCR step 2: text → JSON

    Credential keys:
      ollama_base_url   — Ollama server URL
      openai_api_key    — OpenAI API key
      anthropic_api_key — Anthropic API key

    Legacy keys (ai_provider, ollama_chat_model, etc.) are still read for
    backward compatibility when the new per-role keys are absent from DB.
    """
    s = get_settings()
    db_vals = await _load_cache(db)

    # ── Credentials ────────────────────────────────────────────────────────────
    ollama_base_url = db_vals.get("ollama_base_url", s.OLLAMA_BASE_URL)
    openai_api_key = db_vals.get("openai_api_key", s.OPENAI_API_KEY)
    anthropic_api_key = db_vals.get("anthropic_api_key", s.ANTHROPIC_API_KEY)

    # ── Legacy fallbacks ───────────────────────────────────────────────────────
    legacy_provider = db_vals.get("ai_provider", s.AI_PROVIDER)
    legacy_ollama_chat = db_vals.get("ollama_chat_model", s.OLLAMA_CHAT_MODEL or s.OLLAMA_MODEL)
    legacy_ollama_emb = db_vals.get("ollama_embedding_model", s.OLLAMA_EMBEDDING_MODEL or s.OLLAMA_MODEL)
    legacy_ollama_vision = db_vals.get("ollama_vision_model", s.OLLAMA_VISION_MODEL)
    legacy_openai_chat = db_vals.get("openai_chat_model", s.OPENAI_MODEL)
    legacy_openai_emb = db_vals.get("openai_embedding_model", s.OPENAI_EMBEDDING_MODEL)

    # ── Chat / Generation ──────────────────────────────────────────────────────
    chat_provider = db_vals.get("chat_provider", legacy_provider)
    chat_model = db_vals.get("chat_model", _resolve_model(
        chat_provider, legacy_ollama_chat, legacy_openai_chat, "claude-haiku-4-5-20251001",
    ))

    # ── Embeddings ─────────────────────────────────────────────────────────────
    # Anthropic has no public embedding model; default to ollama if legacy was anthropic
    emb_provider_default = legacy_provider if legacy_provider in ("ollama", "openai") else "ollama"
    embedding_provider = db_vals.get("embedding_provider", emb_provider_default)
    embedding_model = db_vals.get("embedding_model", _resolve_model(
        embedding_provider, legacy_ollama_emb, legacy_openai_emb, legacy_ollama_emb,
    ))

    # ── OCR Vision ─────────────────────────────────────────────────────────────
    ocr_vision_provider = db_vals.get("ocr_vision_provider", "ollama")
    ocr_vision_model = db_vals.get("ocr_vision_model", legacy_ollama_vision)

    # ── OCR Structuring ────────────────────────────────────────────────────────
    ocr_structure_provider = db_vals.get("ocr_structure_provider", chat_provider)
    ocr_structure_model = db_vals.get("ocr_structure_model", _resolve_model(
        ocr_structure_provider, legacy_ollama_chat, legacy_openai_chat, "claude-haiku-4-5-20251001",
    ))

    return {
        "ollama_base_url": ollama_base_url,
        "openai_api_key": openai_api_key,
        "anthropic_api_key": anthropic_api_key,
        "chat_provider": chat_provider,
        "chat_model": chat_model,
        "embedding_provider": embedding_provider,
        "embedding_model": embedding_model,
        "ocr_vision_provider": ocr_vision_provider,
        "ocr_vision_model": ocr_vision_model,
        "ocr_structure_provider": ocr_structure_provider,
        "ocr_structure_model": ocr_structure_model,
    }


async def get_all_settings(db: AsyncSession) -> dict[str, str]:
    """Return the full effective config dict (used by the admin API)."""
    return await get_ai_config(db)


async def get_prompt_config(db: AsyncSession) -> dict[str, str]:
    """Return the effective prompt strings, with DB values overriding the module defaults."""
    from app.prompts import PROMPT_DEFAULTS
    db_vals = await _load_cache(db)
    return {key: db_vals.get(key, default) for key, default in PROMPT_DEFAULTS.items()}


async def save_settings(updates: dict[str, str], db: AsyncSession) -> None:
    """Upsert the given key-value pairs and invalidate the cache."""
    from app.models.settings import SystemSetting
    for key, value in updates.items():
        existing = await db.get(SystemSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(SystemSetting(key=key, value=value))
    await db.commit()
    invalidate_cache()


async def delete_setting(key: str, db: AsyncSession) -> None:
    """Delete a single setting key from DB (causes the default to apply again)."""
    from app.models.settings import SystemSetting
    existing = await db.get(SystemSetting, key)
    if existing:
        await db.delete(existing)
        await db.commit()
        invalidate_cache()
