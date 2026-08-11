from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
import aiofiles
import os
import uuid

from app.database import get_db
from app.models.recipe import Recipe, Ingredient, Step
from app.models.sharing import RecipeShare
from app.models.favorites import RecipeFavorite
from app.models.user import User
from app.schemas.recipe import (
    RecipeCreate, RecipeUpdate, RecipeOut, RecipeListOut,
    RecipeShareCreate, RecipeShareOut,
)
from app.api.deps import get_current_user
from app.config import get_settings
from app.services.unit_converter import convert_recipe_units
from app.services.ai_service import index_recipe_background

settings = get_settings()
router = APIRouter(prefix="/recipes", tags=["recipes"])


def recipe_query_with_relations():
    return select(Recipe).options(
        selectinload(Recipe.ingredients),
        selectinload(Recipe.steps),
    )


async def _get_accessible_recipe(
    recipe_id: str, user: User, db: AsyncSession, require_edit: bool = False
) -> Recipe:
    """Return a recipe if the user owns it or has the required share permission."""
    result = await db.execute(
        recipe_query_with_relations().where(Recipe.id == recipe_id)
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    if recipe.owner_id == user.id:
        return recipe

    # Check share permissions
    share_result = await db.execute(
        select(RecipeShare).where(
            RecipeShare.recipe_id == recipe_id,
            RecipeShare.shared_with_id == user.id,
        )
    )
    share = share_result.scalar_one_or_none()

    if not share:
        raise HTTPException(status_code=403, detail="Access denied")
    if require_edit and share.permission != "edit":
        raise HTTPException(status_code=403, detail="Edit permission required")

    return recipe


def _make_recipe_proxy(recipe: Recipe, **extra):
    """Build a lightweight proxy from a Recipe ORM object with extra attributes."""
    return type(
        "Recipe",
        (),
        {**{c.key: getattr(recipe, c.key) for c in recipe.__table__.columns}, **extra},
    )()


@router.get("/", response_model=list[RecipeListOut])
async def list_recipes(
    category: str | None = None,
    search: str | None = None,
    favorites_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Owned recipes
    q = select(Recipe).where(Recipe.owner_id == current_user.id)

    # Shared recipes IDs
    shared_result = await db.execute(
        select(RecipeShare.recipe_id).where(RecipeShare.shared_with_id == current_user.id)
    )
    shared_ids = [r for (r,) in shared_result.all()]

    if shared_ids:
        q = select(Recipe).where(
            or_(Recipe.owner_id == current_user.id, Recipe.id.in_(shared_ids))
        )

    if category:
        q = q.where(Recipe.category == category)

    if search:
        term = f"%{search}%"
        q = q.where(
            or_(Recipe.title.ilike(term), Recipe.description.ilike(term), Recipe.tags.ilike(term))
        )

    # Fetch user's favorite recipe IDs for is_favorite flag
    fav_result = await db.execute(
        select(RecipeFavorite.recipe_id).where(RecipeFavorite.user_id == current_user.id)
    )
    fav_ids = {r for (r,) in fav_result.all()}

    if favorites_only:
        q = q.where(Recipe.id.in_(fav_ids))

    q = q.order_by(Recipe.updated_at.desc())
    result = await db.execute(q)
    recipes = result.scalars().all()

    return [_make_recipe_proxy(r, is_favorite=(r.id in fav_ids)) for r in recipes]


@router.post("/", response_model=RecipeOut, status_code=201)
async def create_recipe(
    body: RecipeCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = Recipe(
        owner_id=current_user.id,
        title=body.title,
        description=body.description,
        category=body.category,
        prep_time_minutes=body.prep_time_minutes,
        cook_time_minutes=body.cook_time_minutes,
        servings=body.servings,
        source_language=body.source_language,
        is_public=body.is_public,
        is_draft=body.is_draft,
        tags=body.tags,
        is_ai_generated=body.is_ai_generated,
        ai_model_used=body.ai_model_used,
    )
    db.add(recipe)
    await db.flush()

    for ing_data in body.ingredients:
        db.add(Ingredient(recipe_id=recipe.id, **ing_data.model_dump()))
    for step_data in body.steps:
        db.add(Step(recipe_id=recipe.id, **step_data.model_dump()))

    await db.flush()
    await db.refresh(recipe)

    # Reload with relations
    result = await db.execute(recipe_query_with_relations().where(Recipe.id == recipe.id))
    recipe_out = result.scalar_one()

    # Commit now so the background task's own session can see the new recipe.
    # (BackgroundTasks run before get_db's post-yield commit in FastAPI's lifecycle.)
    await db.commit()
    background_tasks.add_task(index_recipe_background, recipe.id)

    return recipe_out


@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe(
    recipe_id: str,
    unit_system: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await _get_accessible_recipe(recipe_id, current_user, db)
    target_units = unit_system or current_user.unit_system

    if recipe.owner_id == current_user.id:
        my_permission = "owner"
        shared_by_username = None
    else:
        share_result = await db.execute(
            select(RecipeShare).where(
                RecipeShare.recipe_id == recipe_id,
                RecipeShare.shared_with_id == current_user.id,
            )
        )
        share = share_result.scalar_one_or_none()
        my_permission = share.permission if share else "read"
        shared_by_username = None
        if share and share.shared_by_id:
            sharer = await db.get(User, share.shared_by_id)
            shared_by_username = sharer.username if sharer else None

    fav_result = await db.execute(
        select(RecipeFavorite).where(
            RecipeFavorite.user_id == current_user.id,
            RecipeFavorite.recipe_id == recipe_id,
        )
    )
    is_favorite = fav_result.scalar_one_or_none() is not None

    return convert_recipe_units(
        recipe, target_units,
        my_permission=my_permission,
        shared_by_username=shared_by_username,
        is_favorite=is_favorite,
    )


@router.patch("/{recipe_id}", response_model=RecipeOut)
async def update_recipe(
    recipe_id: str,
    body: RecipeUpdate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await _get_accessible_recipe(recipe_id, current_user, db, require_edit=True)

    for field, val in body.model_dump(exclude_none=True, exclude={"ingredients", "steps"}).items():
        setattr(recipe, field, val)

    if body.ingredients is not None:
        for ing in recipe.ingredients:
            await db.delete(ing)
        for ing_data in body.ingredients:
            db.add(Ingredient(recipe_id=recipe.id, **ing_data.model_dump()))

    if body.steps is not None:
        for step in recipe.steps:
            await db.delete(step)
        for step_data in body.steps:
            db.add(Step(recipe_id=recipe.id, **step_data.model_dump()))

    db.add(recipe)
    await db.flush()

    result = await db.execute(recipe_query_with_relations().where(Recipe.id == recipe.id))
    recipe_out = result.scalar_one()

    await db.commit()
    background_tasks.add_task(index_recipe_background, recipe.id)

    return recipe_out


@router.delete("/{recipe_id}", status_code=204)
async def delete_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if not recipe or recipe.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="Recipe not found")
    await db.delete(recipe)


@router.post("/{recipe_id}/image")
async def upload_image(
    recipe_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    recipe = await _get_accessible_recipe(recipe_id, current_user, db, require_edit=True)

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image format")

    filename = f"{uuid.uuid4()}{ext}"
    path = os.path.join(settings.UPLOAD_DIR, filename)

    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    async with aiofiles.open(path, "wb") as f:
        await f.write(content)

    recipe.image_path = f"/uploads/{filename}"
    db.add(recipe)
    return {"image_path": recipe.image_path}


# ── Sharing ───────────────────────────────────────────────────────────────────

@router.post("/{recipe_id}/share", response_model=RecipeShareOut, status_code=201)
async def share_recipe(
    recipe_id: str,
    body: RecipeShareCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    # Determine the current user's access level
    if recipe.owner_id == current_user.id:
        my_permission = "owner"
    else:
        my_share_result = await db.execute(
            select(RecipeShare).where(
                RecipeShare.recipe_id == recipe_id,
                RecipeShare.shared_with_id == current_user.id,
            )
        )
        my_share = my_share_result.scalar_one_or_none()
        if not my_share:
            raise HTTPException(status_code=403, detail="You do not have access to this recipe")
        my_permission = my_share.permission

    # Enforce permission ceiling: a read-only user cannot grant edit access
    if my_permission == "read" and body.permission == "edit":
        raise HTTPException(
            status_code=403,
            detail="You can only share with read access (you have read-only access yourself)",
        )

    target_result = await db.execute(select(User).where(User.username == body.shared_with_username))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")
    if target.id == recipe.owner_id:
        raise HTTPException(status_code=400, detail="Cannot share with the recipe owner")

    # Upsert: update permission if already shared
    existing_result = await db.execute(
        select(RecipeShare).where(
            RecipeShare.recipe_id == recipe_id,
            RecipeShare.shared_with_id == target.id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        existing.permission = body.permission
        existing.shared_by_id = current_user.id
        existing.seen_at = None  # reset so recipient is notified again
        db.add(existing)
        await db.flush()
        await db.refresh(existing)
        return existing

    share = RecipeShare(
        recipe_id=recipe_id,
        shared_with_id=target.id,
        shared_by_id=current_user.id,
        permission=body.permission,
    )
    db.add(share)
    await db.flush()
    await db.refresh(share)
    return share


@router.delete("/{recipe_id}/share/{share_id}", status_code=204)
async def revoke_share(
    recipe_id: str,
    share_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Recipe).where(Recipe.id == recipe_id))
    recipe = result.scalar_one_or_none()
    if not recipe or recipe.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    share_result = await db.execute(
        select(RecipeShare).where(RecipeShare.id == share_id, RecipeShare.recipe_id == recipe_id)
    )
    share = share_result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=404, detail="Share not found")
    await db.delete(share)


# ── Favorites ─────────────────────────────────────────────────────────────────

@router.post("/{recipe_id}/favorite", status_code=201)
async def favorite_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_accessible_recipe(recipe_id, current_user, db)

    existing = await db.execute(
        select(RecipeFavorite).where(
            RecipeFavorite.user_id == current_user.id,
            RecipeFavorite.recipe_id == recipe_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(RecipeFavorite(user_id=current_user.id, recipe_id=recipe_id))

    return {"is_favorite": True}


@router.delete("/{recipe_id}/favorite", status_code=200)
async def unfavorite_recipe(
    recipe_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RecipeFavorite).where(
            RecipeFavorite.user_id == current_user.id,
            RecipeFavorite.recipe_id == recipe_id,
        )
    )
    fav = result.scalar_one_or_none()
    if fav:
        await db.delete(fav)
    return {"is_favorite": False}
