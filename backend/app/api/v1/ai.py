from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.recipe import Recipe
from app.models.user import User
from app.api.deps import get_current_user
from app.services.ai_service import (
    search_recipes_ai,
    generate_recipe_ai,
    chat_with_agent,
    stream_chat_with_agent,
    index_recipe,
    start_import_task,
    get_import_task,
)

router = APIRouter(prefix="/ai", tags=["ai"])


class AISearchRequest(BaseModel):
    query: str


class AIGenerateRequest(BaseModel):
    prompt: str
    servings: int | None = None
    unit_system: str = "metric"


class AIImportUrlRequest(BaseModel):
    url: str


class AIChatRequest(BaseModel):
    message: str
    history: list[dict] = []


@router.post("/search")
async def ai_search(
    body: AISearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search over the user's recipes using embeddings."""
    results = await search_recipes_ai(body.query, current_user.id, db)
    return {"results": results}


@router.post("/generate")
async def ai_generate(
    body: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ask the AI to generate a new recipe from a description."""
    recipe_data, model_name = await generate_recipe_ai(body.prompt, body.servings, body.unit_system, db)
    return {**recipe_data, "_ai_model": model_name}


@router.post("/import-url")
async def ai_import_url(
    body: AIImportUrlRequest,
    current_user: User = Depends(get_current_user),
):
    """Start a background URL import task. Poll /ai/import-url/status/{task_id} for the result."""
    task_id = start_import_task(body.url)
    return {"task_id": task_id}


@router.get("/import-url/status/{task_id}")
async def ai_import_url_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll the status of a background URL import task.

    Returns:
      - {"status": "pending"}
      - {"status": "done", "result": {..., "_ai_model": "..."}}
      - {"status": "error", "error": "..."}
    """
    task = get_import_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/chat")
async def ai_chat(
    body: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Chat with the culinary AI assistant."""
    response, model_name = await chat_with_agent(body.message, body.history, current_user.id, db)
    return {"response": response, "model": model_name}


@router.post("/chat/stream")
async def ai_chat_stream(
    body: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stream chat response as Server-Sent Events."""
    return StreamingResponse(
        stream_chat_with_agent(body.message, body.history, db),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/index/{recipe_id}")
async def index_recipe_endpoint(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-index a recipe into the vector store (called automatically on create/update)."""
    result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .where(Recipe.id == recipe_id, Recipe.owner_id == current_user.id)
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    await index_recipe(recipe, db)
    return {"message": "Recipe indexed"}
