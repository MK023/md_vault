"""Shared fixtures for MD Vault backend tests."""

import importlib
import os

# Set env vars BEFORE any backend imports
os.environ["JWT_SECRET"] = "test-secret-key-for-testing-minimum-32-bytes"
os.environ["ADMIN_PASSWORD"] = "testpass123"
os.environ["SENTRY_DSN"] = ""
os.environ["CORS_ORIGINS"] = "*"
os.environ["DOCS_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def tmp_data(tmp_path):
    """Create temp DB path + upload dir and set env vars."""
    db_path = str(tmp_path / "test_vault.db")
    upload_dir = str(tmp_path / "uploads")
    os.makedirs(upload_dir, exist_ok=True)

    os.environ["DB_PATH"] = db_path
    os.environ["UPLOAD_DIR"] = upload_dir

    yield {"db_path": db_path, "upload_dir": upload_dir}


@pytest.fixture()
def client(tmp_data):
    """Create a TestClient with a fresh isolated DB per test."""
    import backend.config
    import backend.database
    import backend.main

    importlib.reload(backend.config)
    importlib.reload(backend.database)
    importlib.reload(backend.main)

    from backend.main import app

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture()
def auth_header(client):
    """Log in as admin and return Authorization header dict."""
    resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "testpass123"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
