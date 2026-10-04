from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+aiomysql://root:1212@localhost:3306/bartasetu"
    SECRET_KEY: str = "bartasetu-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    FCM_CREDENTIALS_PATH: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
