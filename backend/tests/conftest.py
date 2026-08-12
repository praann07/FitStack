import os
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.core.database import Base, get_db
from app.core.limiter import limiter
from app.main import app as fastapi_app

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Auth routes are rate-limited at 5/minute keyed by client IP. TestClient
    requests all share one fake IP, so without a reset, later tests would trip
    the limit from earlier tests' register/login calls. Tests that specifically
    exercise the limiter do so within a single test, which still sees it fresh."""
    limiter.reset()
    yield


@pytest.fixture(scope="session")
def engine():
    if not TEST_DATABASE_URL:
        pytest.exit(
            "TEST_DATABASE_URL is not set. Point it at a throwaway Postgres "
            "database (see backend/README.md) before running the test suite.",
            returncode=1,
        )
    eng = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db_session(engine):
    """One connection + outer transaction per test, rolled back at the end.

    Route handlers call session.commit() freely; join_transaction_mode="create_savepoint"
    makes those commits release a SAVEPOINT instead of the outer transaction, so the
    final rollback always undoes everything the test did.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    def _get_db_override():
        yield db_session

    fastapi_app.dependency_overrides[get_db] = _get_db_override
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()


def register_user(client: TestClient, **overrides) -> tuple[str, dict]:
    """POSTs /auth/register with sane defaults, returns (access_token, user_json)."""
    payload = {
        "email": f"{uuid.uuid4()}@example.com",
        "password": "testpassword123",
        "full_name": "Test User",
        "goal": "cut",
        "goal_rate_kg_week": -0.5,
        "height_cm": 178,
        "weight_kg": 80,
        "age": 28,
        "sex": "male",
        "activity_level": "moderate",
        **overrides,
    }
    res = client.post("/api/v1/auth/register", json=payload)
    assert res.status_code == 201, res.text
    body = res.json()
    return body["access_token"], body["user"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
