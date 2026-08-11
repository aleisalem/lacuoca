"""
Seed script — creates the admin user if it doesn't exist yet.
Run automatically by docker-compose after migrations.
"""
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal, engine
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.config import get_settings

settings = get_settings()


async def seed():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == settings.ADMIN_USERNAME))
        existing = result.scalar_one_or_none()
        if not existing:
            admin = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                role=UserRole.admin,
                is_active=True,
            )
            db.add(admin)
            await db.commit()
            print(f"[seed] Admin user '{settings.ADMIN_USERNAME}' created.")
        else:
            # Sync password from config so changes to ADMIN_PASSWORD in .env take effect.
            from app.core.security import verify_password
            if not verify_password(settings.ADMIN_PASSWORD, existing.hashed_password):
                existing.hashed_password = hash_password(settings.ADMIN_PASSWORD)
                db.add(existing)
                await db.commit()
                print(f"[seed] Admin password updated from config.")
            else:
                print(f"[seed] Admin user '{settings.ADMIN_USERNAME}' already exists.")


if __name__ == "__main__":
    asyncio.run(seed())
