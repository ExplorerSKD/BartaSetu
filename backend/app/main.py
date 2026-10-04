import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import inspect, select, text

from app.config import settings
from app.database import engine, Base, async_session
import app.models  # Ensures all SQLAlchemy models are registered
from app.models.user import User
from app.utils.ids import generate_bs_id
from app.routers import auth, users, devices, messages, sos, admin
from app.websocket.manager import websocket_endpoint
from app.services.fcm_service import init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("bartasetu.api")


def migrate_schema(sync_conn) -> None:
    """create_all() never alters existing tables, so apply the small column changes made since."""
    inspector = inspect(sync_conn)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "bs_id" not in columns:
        logger.info("Migrating: adding users.bs_id column")
        sync_conn.execute(text("ALTER TABLE users ADD COLUMN bs_id VARCHAR(12) NULL"))
        sync_conn.execute(text("CREATE UNIQUE INDEX ix_users_bs_id ON users (bs_id)"))

    if sync_conn.dialect.name == "mysql":
        sos_columns = {col["name"]: col for col in inspector.get_columns("sos_alerts")}
        for name in ("latitude", "longitude"):
            if name in sos_columns and not sos_columns[name]["nullable"]:
                logger.info("Migrating: allowing sos_alerts.%s to be NULL", name)
                sync_conn.execute(text(f"ALTER TABLE sos_alerts MODIFY {name} FLOAT NULL"))


async def backfill_bs_ids() -> None:
    """Give every existing account (e.g. seeded users) a shareable BartaSetu ID."""
    async with async_session() as db:
        result = await db.execute(select(User).where(User.bs_id.is_(None)))
        users = result.scalars().all()
        if not users:
            return
        taken = set((await db.execute(select(User.bs_id).where(User.bs_id.is_not(None)))).scalars().all())
        for user in users:
            candidate = generate_bs_id()
            while candidate in taken:
                candidate = generate_bs_id()
            taken.add(candidate)
            user.bs_id = candidate
        await db.commit()
        logger.info("Assigned BartaSetu IDs to %d existing users", len(users))

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing BartaSetu backend...")
    # Initialize FCM service
    init_firebase(settings.FCM_CREDENTIALS_PATH)
    
    # Create all database tables asynchronously
    async with engine.begin() as conn:
        logger.info("Verifying and creating database tables in MySQL...")
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(migrate_schema)
        logger.info("Database tables initialized successfully.")

    await backfill_bs_ids()

    yield
    
    logger.info("Shutting down BartaSetu backend...")
    await engine.dispose()

app = FastAPI(
    title="BartaSetu API",
    description="Decentralized offline messaging and emergency communication backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(devices.router, prefix="/api/devices", tags=["Devices"])
app.include_router(messages.router, prefix="/api/messages", tags=["Messages"])
app.include_router(sos.router, prefix="/api/sos", tags=["SOS"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])

# WebSocket Route: /ws?token=<access JWT>&device_id=<optional>
app.add_api_websocket_route("/ws", websocket_endpoint)

@app.get("/", tags=["Health"])
async def root():
    return {
        "app": "BartaSetu API",
        "tagline": "Messages that arrive, even without internet.",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
