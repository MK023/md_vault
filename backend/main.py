"""MD Vault — API FastAPI per gestione documentazione personale."""

import os
import platform
import sqlite3
import sys
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.auth import get_current_user
from backend.config import DB_PATH, SENTRY_DSN
from backend.database import get_db, init_db
from backend.routers import auth, documents, search

if SENTRY_DSN:
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.3, send_default_pii=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


_docs_enabled = os.environ.get("DOCS_ENABLED", "").lower() in ("1", "true")
app = FastAPI(
    title="MD Vault",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if _docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if _docs_enabled else None,
)

_allowed_origins = os.environ.get("CORS_ORIGINS", "https://mdvault.site").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(search.router)


@app.get("/api/healthz")
def healthz():
    try:
        with get_db() as conn:
            conn.execute("SELECT 1")
        return {"status": "ok", "db": "connected"}
    except Exception:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "db": "disconnected"},
        )


@app.get("/api/system-info")
def system_info(_user: str = Depends(get_current_user)):
    uname = platform.uname()

    # DB size
    db_size = 0
    try:
        db_size = os.path.getsize(DB_PATH)
    except OSError:
        pass

    # Doc count
    doc_count = 0
    try:
        with get_db() as conn:
            row = conn.execute("SELECT COUNT(*) AS c FROM documents").fetchone()
            doc_count = row["c"]
    except Exception:
        pass

    return {
        "hostname": uname.node,
        "os": f"{uname.system} {uname.release}",
        "arch": uname.machine,
        "python": sys.version.split()[0],
        "sqlite": sqlite3.sqlite_version,
        "cpu_count": os.cpu_count(),
        "db_size_mb": round(db_size / (1024 * 1024), 2),
        "doc_count": doc_count,
    }
