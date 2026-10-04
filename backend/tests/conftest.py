import os
import pathlib

# Run the suite against a throwaway SQLite file instead of the developer's MySQL database.
# Set TEST_DATABASE_URL to point the tests at another database.
_TEST_DB = pathlib.Path(__file__).parent / "test_bartasetu.db"
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite+aiosqlite:///{_TEST_DB.as_posix()}")

import pytest_asyncio  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def app_lifespan():
    """ASGITransport does not run startup events, so create tables and run migrations here."""
    async with app.router.lifespan_context(app):
        yield
