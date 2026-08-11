from fastapi import APIRouter
from .auth import router as auth_router
from .users import router as users_router
from .recipes import router as recipes_router
from .ocr import router as ocr_router
from .ai import router as ai_router
from .admin import router as admin_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(recipes_router)
api_router.include_router(ocr_router)
api_router.include_router(ai_router)
api_router.include_router(admin_router)
