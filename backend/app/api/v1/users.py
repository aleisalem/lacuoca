from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.database import get_db
from app.models.user import User
from app.core.security import hash_password
from app.schemas.user import UserCreate, UserOut, UserUpdate, SignupRequestCreate, SignupRequestOut
from app.models.user import SignupRequest
from app.api.deps import get_current_user, get_admin_user

from app.models.sharing import RecipeShare
from app.models.recipe import Recipe

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/new-shares")
async def get_new_shares(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all unseen recipe shares for the current user with recipe title and sharer name."""
    sharer = User.__table__.alias("sharer")
    rows = await db.execute(
        select(
            RecipeShare.id,
            RecipeShare.recipe_id,
            Recipe.title.label("recipe_title"),
            sharer.c.username.label("shared_by_username"),
            RecipeShare.permission,
            RecipeShare.created_at,
        )
        .join(Recipe, RecipeShare.recipe_id == Recipe.id)
        .outerjoin(sharer, RecipeShare.shared_by_id == sharer.c.id)
        .where(
            RecipeShare.shared_with_id == current_user.id,
            RecipeShare.seen_at.is_(None),
        )
        .order_by(RecipeShare.created_at.desc())
    )
    return [
        {
            "share_id": r.id,
            "recipe_id": r.recipe_id,
            "recipe_title": r.recipe_title,
            "shared_by_username": r.shared_by_username or "Someone",
            "permission": r.permission,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows.mappings()
    ]


@router.post("/me/shares/seen", status_code=200)
async def mark_shares_seen(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark all unseen shares as seen."""
    result = await db.execute(
        update(RecipeShare)
        .where(
            RecipeShare.shared_with_id == current_user.id,
            RecipeShare.seen_at.is_(None),
        )
        .values(seen_at=datetime.now(timezone.utc))
    )
    return {"marked": result.rowcount}


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.email is not None:
        current_user.email = body.email
    if body.unit_system is not None:
        current_user.unit_system = body.unit_system
    if body.preferred_language is not None:
        current_user.preferred_language = body.preferred_language
    db.add(current_user)
    return current_user


# ── Admin routes ─────────────────────────────────────────────────────────────

@router.get("/", response_model=list[UserOut])
async def list_users(
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    # Check uniqueness
    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.patch("/{user_id}/activate")
async def toggle_activate(
    user_id: str,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = not user.is_active
    db.add(user)
    return {"is_active": user.is_active}


# ── Signup Requests ───────────────────────────────────────────────────────────

@router.post("/signup-request", status_code=201)
async def create_signup_request(
    body: SignupRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    # Check that username/email aren't already taken
    existing_user = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing_user.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")

    # Check for a pending request with the same username/email
    existing_req = await db.execute(
        select(SignupRequest).where(
            ((SignupRequest.username == body.username) | (SignupRequest.email == body.email))
            & (SignupRequest.status == "pending")
        )
    )
    if existing_req.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A pending request for this username or email already exists")

    req = SignupRequest(
        username=body.username,
        email=body.email,
        hashed_password=hash_password(body.password),
        message=body.message,
    )
    db.add(req)
    return {"message": "Your request has been submitted. An admin will create your account."}


@router.get("/signup-requests", response_model=list[SignupRequestOut])
async def list_signup_requests(
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SignupRequest).order_by(SignupRequest.created_at.desc())
    )
    return result.scalars().all()


@router.patch("/signup-requests/{req_id}/approve", response_model=UserOut)
async def approve_signup(
    req_id: str,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SignupRequest).where(SignupRequest.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request has already been processed")

    # Check username/email aren't taken yet (race condition guard)
    existing = await db.execute(
        select(User).where((User.username == req.username) | (User.email == req.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        username=req.username,
        email=req.email,
        hashed_password=req.hashed_password,
        role="user",
        is_active=True,
    )
    db.add(user)
    req.status = "approved"
    db.add(req)
    await db.flush()
    await db.refresh(user)
    return user
