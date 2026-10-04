import asyncio
from app.database import async_session, engine, Base
import app.models
from app.models.user import User
from app.utils.security import hash_password
from sqlalchemy import select

DUMMY_USERS = [
    {
        "username": "citizen",
        "email": "citizen@bartasetu.org",
        "password": "password123",
        "display_name": "Subrata Roy (Citizen)"
    },
    {
        "username": "relay",
        "email": "relay@bartasetu.org",
        "password": "password123",
        "display_name": "Animesh Das (Relay Node)"
    },
    {
        "username": "gateway",
        "email": "gateway@bartasetu.org",
        "password": "password123",
        "display_name": "Fatima Begum (Internet Gateway)"
    },
    {
        "username": "admin",
        "email": "admin@bartasetu.org",
        "password": "password123",
        "display_name": "Emergency HQ Commander"
    }
]

async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_session() as db:
        for u in DUMMY_USERS:
            res = await db.execute(select(User).where(User.username == u["username"]))
            existing = res.scalar_one_or_none()
            if not existing:
                user = User(
                    username=u["username"],
                    email=u["email"],
                    password_hash=hash_password(u["password"]),
                    display_name=u["display_name"]
                )
                db.add(user)
                print(f"Created user: {u['username']} (password: {u['password']})")
            else:
                existing.password_hash = hash_password(u["password"])
                existing.display_name = u["display_name"]
                print(f"Updated password for user: {u['username']}")
        await db.commit()
    print("Seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
