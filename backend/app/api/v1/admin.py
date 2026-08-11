"""
Admin-only endpoints.
AI settings and prompts are stored in the system_settings table and can be
overridden per-role: chat, embedding, OCR vision, and OCR structuring each
have their own provider (ollama | openai | anthropic) and model name.
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.api.deps import get_admin_user
from app.services.settings_service import (
    get_all_settings, save_settings, get_prompt_config, delete_setting,
)

router = APIRouter(prefix="/admin", tags=["admin"])

# Keys that admins are allowed to read and write through this endpoint.
ALLOWED_KEYS = {
    # Credentials
    "ollama_base_url",
    "openai_api_key",
    "anthropic_api_key",
    # Per-role: provider + model
    "chat_provider",
    "chat_model",
    "embedding_provider",
    "embedding_model",
    "ocr_vision_provider",
    "ocr_vision_model",
    "ocr_structure_provider",
    "ocr_structure_model",
}

API_KEY_FIELDS = {"openai_api_key", "anthropic_api_key"}


def _mask_key(key: str) -> str:
    """Return a partially-masked API key for display (last 4 chars visible)."""
    if not key or len(key) < 8:
        return key
    return f"{'•' * (len(key) - 4)}{key[-4:]}"


# ── AI Settings schemas ────────────────────────────────────────────────────────

class AISettingsOut(BaseModel):
    # Credentials
    ollama_base_url: str
    openai_api_key_set: bool
    openai_api_key_preview: str
    anthropic_api_key_set: bool
    anthropic_api_key_preview: str
    # Per-role
    chat_provider: str
    chat_model: str
    embedding_provider: str
    embedding_model: str
    ocr_vision_provider: str
    ocr_vision_model: str
    ocr_structure_provider: str
    ocr_structure_model: str


class AISettingsIn(BaseModel):
    ollama_base_url: str | None = None
    openai_api_key: str | None = None        # blank = don't update
    anthropic_api_key: str | None = None     # blank = don't update
    chat_provider: str | None = None
    chat_model: str | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None
    ocr_vision_provider: str | None = None
    ocr_vision_model: str | None = None
    ocr_structure_provider: str | None = None
    ocr_structure_model: str | None = None


def _cfg_to_out(cfg: dict) -> AISettingsOut:
    openai_key = cfg.get("openai_api_key", "")
    anthropic_key = cfg.get("anthropic_api_key", "")
    return AISettingsOut(
        ollama_base_url=cfg["ollama_base_url"],
        openai_api_key_set=bool(openai_key),
        openai_api_key_preview=_mask_key(openai_key),
        anthropic_api_key_set=bool(anthropic_key),
        anthropic_api_key_preview=_mask_key(anthropic_key),
        chat_provider=cfg["chat_provider"],
        chat_model=cfg["chat_model"],
        embedding_provider=cfg["embedding_provider"],
        embedding_model=cfg["embedding_model"],
        ocr_vision_provider=cfg["ocr_vision_provider"],
        ocr_vision_model=cfg["ocr_vision_model"],
        ocr_structure_provider=cfg["ocr_structure_provider"],
        ocr_structure_model=cfg["ocr_structure_model"],
    )


@router.get("/settings", response_model=AISettingsOut)
async def get_settings_endpoint(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the effective AI settings (DB overrides merged with env defaults)."""
    cfg = await get_all_settings(db)
    return _cfg_to_out(cfg)


@router.put("/settings", response_model=AISettingsOut)
async def update_settings(
    body: AISettingsIn,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist AI settings overrides. Only non-null, non-empty fields are updated."""
    data = body.model_dump()
    updates = {}
    for k, v in data.items():
        if k not in ALLOWED_KEYS or v is None:
            continue
        # API keys: skip blank strings (user left field empty = no change)
        if k in API_KEY_FIELDS and not v.strip():
            continue
        # Other fields: skip empty strings
        if not isinstance(v, str) or v.strip():
            updates[k] = v
    if updates:
        await save_settings(updates, db)
    cfg = await get_all_settings(db)
    return _cfg_to_out(cfg)


@router.post("/reindex", status_code=202)
async def reindex_all_recipes(
    background_tasks: BackgroundTasks,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Queue a background re-index of every recipe in the database.
    Run this after changing the embedding model to keep search consistent.
    """
    from app.models.recipe import Recipe
    from app.services.ai_service import index_recipe_background

    result = await db.execute(select(Recipe.id))
    recipe_ids = [row[0] for row in result.all()]

    for rid in recipe_ids:
        background_tasks.add_task(index_recipe_background, rid)

    return {"queued": len(recipe_ids), "message": f"Re-indexing {len(recipe_ids)} recipes in the background"}


# ── Prompt management ─────────────────────────────────────────────────────────

PROMPT_KEYS = {
    "prompt_recipe_generate",
    "prompt_chat_system",
    "prompt_ocr_vision",
    "prompt_ocr_structure",
    "prompt_url_import",
}


class PromptsOut(BaseModel):
    prompt_recipe_generate: str
    prompt_chat_system: str
    prompt_ocr_vision: str
    prompt_ocr_structure: str
    prompt_url_import: str


class PromptsIn(BaseModel):
    prompt_recipe_generate: str | None = None
    prompt_chat_system: str | None = None
    prompt_ocr_vision: str | None = None
    prompt_ocr_structure: str | None = None
    prompt_url_import: str | None = None


@router.get("/prompts", response_model=PromptsOut)
async def get_prompts(
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the effective prompt strings (DB overrides merged with module defaults)."""
    cfg = await get_prompt_config(db)
    return PromptsOut(**cfg)


@router.put("/prompts", response_model=PromptsOut)
async def update_prompts(
    body: PromptsIn,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist prompt overrides. Only non-null, non-empty fields are saved."""
    updates = {
        k: v for k, v in body.model_dump().items()
        if v is not None and v.strip() and k in PROMPT_KEYS
    }
    if updates:
        await save_settings(updates, db)
    cfg = await get_prompt_config(db)
    return PromptsOut(**cfg)


@router.delete("/prompts/{key}", response_model=PromptsOut)
async def reset_prompt(
    key: str,
    _admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a prompt override so the hardcoded default applies again."""
    if key not in PROMPT_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")
    await delete_setting(key, db)
    cfg = await get_prompt_config(db)
    return PromptsOut(**cfg)
