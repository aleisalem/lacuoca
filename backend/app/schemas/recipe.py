from datetime import datetime
from pydantic import BaseModel


class IngredientCreate(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    order: int = 0
    notes: str | None = None


class IngredientOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    quantity: float | None
    unit: str | None
    order: int
    notes: str | None


class StepCreate(BaseModel):
    order: int
    description: str
    duration_minutes: int | None = None


class StepOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    order: int
    description: str
    duration_minutes: int | None


class RecipeCreate(BaseModel):
    title: str
    description: str | None = None
    category: str = "other"
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    servings: int | None = None
    source_language: str = "en"
    is_public: bool = False
    is_draft: bool = False
    tags: str | None = None
    is_ai_generated: bool = False
    ai_model_used: str | None = None
    ingredients: list[IngredientCreate] = []
    steps: list[StepCreate] = []


class RecipeUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    servings: int | None = None
    is_public: bool | None = None
    is_draft: bool | None = None
    tags: str | None = None
    ingredients: list[IngredientCreate] | None = None
    steps: list[StepCreate] | None = None


class RecipeOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    owner_id: str
    title: str
    description: str | None
    category: str
    prep_time_minutes: int | None
    cook_time_minutes: int | None
    servings: int | None
    image_path: str | None
    source_language: str
    is_public: bool
    is_draft: bool = False
    tags: str | None
    is_ai_generated: bool = False
    ai_model_used: str | None = None
    ingredients: list[IngredientOut]
    steps: list[StepOut]
    created_at: datetime
    updated_at: datetime
    # Access context — set by the get_recipe endpoint; defaults keep create/update working
    my_permission: str = "owner"       # "owner" | "read" | "edit"
    shared_by_username: str | None = None  # who shared this recipe with me (if any)
    is_favorite: bool = False


class RecipeListOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    title: str
    description: str | None
    category: str
    prep_time_minutes: int | None
    cook_time_minutes: int | None
    servings: int | None
    image_path: str | None
    tags: str | None
    is_public: bool
    is_draft: bool = False
    owner_id: str
    is_ai_generated: bool = False
    ai_model_used: str | None = None
    is_favorite: bool = False
    created_at: datetime


class RecipeShareCreate(BaseModel):
    shared_with_username: str
    permission: str = "read"


class RecipeShareOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    recipe_id: str
    shared_with_id: str
    shared_by_id: str | None
    permission: str
    seen_at: datetime | None
    created_at: datetime
