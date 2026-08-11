import asyncio
import uuid as uuid_module

from fastapi import APIRouter, BackgroundTasks, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.ocr_service import extract_recipe_from_image
from app.models.user import User
from app.api.deps import get_current_user

router = APIRouter(prefix="/ocr", tags=["ocr"])

# In-memory task store: task_id -> {"status": "pending"|"done"|"failed", "result": dict|None, "error": str|None}
_tasks: dict[str, dict] = {}


@router.post("/extract")
async def ocr_extract(
    file: UploadFile = File(...),
    language: str = "eng",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a photo of a recipe page (English or German) and extract structured data.
    language: 'eng' for English, 'deu' for German (or 'eng+deu' for both)
    """
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 15 MB)")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "tiff", "bmp"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    try:
        result = await extract_recipe_from_image(content, language, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")

    return result


@router.post("/extract-background")
async def ocr_extract_background(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    language: str = "eng",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start OCR extraction in the background. Returns a task_id to poll for results."""
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 15 MB)")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in {"jpg", "jpeg", "png", "webp", "tiff", "bmp"}:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    task_id = str(uuid_module.uuid4())
    _tasks[task_id] = {"status": "pending", "result": None, "error": None}

    background_tasks.add_task(_run_ocr_task, task_id, content, language)
    return {"task_id": task_id}


@router.get("/task/{task_id}")
async def get_ocr_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll the status of a background OCR task."""
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _run_ocr_task(task_id: str, content: bytes, language: str):
    """Background coroutine — runs OCR and stores result in _tasks."""
    from app.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            result = await extract_recipe_from_image(content, language, db)
            _tasks[task_id] = {"status": "done", "result": result, "error": None}
        except Exception as exc:
            _tasks[task_id] = {"status": "failed", "result": None, "error": str(exc)}
