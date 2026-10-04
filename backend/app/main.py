import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine, Base
import app.models  # Ensures all SQLAlchemy models are registered
from app.routers import auth, users, devices, messages, sos, admin
from app.websocket.manager import websocket_endpoint
from app.services.fcm_service import init_firebase

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("bartasetu.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing BartaSetu backend...")
    # Initialize FCM service
    init_firebase(settings.FCM_CREDENTIALS_PATH)
    
    # Create all database tables asynchronously
    async with engine.begin() as conn:
        logger.info("Verifying and creating database tables in MySQL...")
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables initialized successfully.")
    
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

# WebSocket Route
app.add_api_websocket_route("/ws/{user_id}", websocket_endpoint)

@app.get("/", tags=["Health"])
async def root():
    return {
        "app": "BartaSetu API",
        "tagline": "বার্তা পৌঁছাবে, Internet না থাকলেও।",
        "status": "online",
        "version": "1.0.0"
    }

@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
