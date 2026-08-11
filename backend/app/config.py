from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "LaCuoca"
    APP_ENV: str = "development"
    APP_SECRET_KEY: str = "insecure-dev-secret"
    APP_ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.APP_ALLOWED_ORIGINS.split(",")]

    # Database
    POSTGRES_USER: str = "lacuoca"
    POSTGRES_PASSWORD: str = "lacuoca_dev_password"
    POSTGRES_DB: str = "lacuoca"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    DATABASE_URL: str = (
        "postgresql+asyncpg://lacuoca:lacuoca_dev_password@localhost:5432/lacuoca"
    )

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "insecure-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Admin seed
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@lacuoca.local"
    ADMIN_PASSWORD: str = "ChangeMe123!"

    # AI
    AI_PROVIDER: str = "ollama"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    # Default model used as fallback for all Ollama roles when role-specific vars are unset
    OLLAMA_MODEL: str = "llama3.2"
    # Role-specific Ollama models (defaults fall back to OLLAMA_MODEL)
    OLLAMA_CHAT_MODEL: str = ""          # recipe generation + chat; blank → OLLAMA_MODEL
    OLLAMA_EMBEDDING_MODEL: str = ""     # embeddings + retrieval; blank → OLLAMA_MODEL
    # Vision model for OCR — step 1 of the pipeline (image → plain text transcription):
    OLLAMA_VISION_MODEL: str = "qwen3-vl"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"   # chat + generation
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    ANTHROPIC_API_KEY: str = ""

    # Uploads
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 10


@lru_cache
def get_settings() -> Settings:
    return Settings()
