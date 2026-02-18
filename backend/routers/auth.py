"""Router autenticazione: login e cambio password."""

import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status

from backend.auth import create_token, get_current_user, hash_password, verify_password
from backend.database import get_db
from backend.models import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

# --- Rate limiting (in-memory, per-IP) ---
_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_WINDOW = 300  # 5 minuti
_RATE_LIMIT_MAX = 10  # max 10 tentativi per finestra


def _check_rate_limit(ip: str):
    now = time.monotonic()
    attempts = _login_attempts[ip]
    # Rimuovi tentativi vecchi
    _login_attempts[ip] = [t for t in attempts if now - t < _RATE_LIMIT_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )
    _login_attempts[ip].append(now)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request):
    client_ip = request.headers.get("X-Real-IP") or (
        request.client.host if request.client else "unknown"
    )
    _check_rate_limit(client_ip)

    with get_db() as conn:
        row = conn.execute(
            "SELECT username, password_hash FROM users WHERE username = ?",
            (body.username,),
        ).fetchone()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Login riuscito: pulisci i tentativi
    _login_attempts.pop(client_ip, None)
    token = create_token(row["username"])
    return TokenResponse(access_token=token)


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: LoginRequest,
    current_user: str = Depends(get_current_user),
):
    """Cambia password dell'utente autenticato."""
    if body.username != current_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot change another user's password",
        )
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (hash_password(body.password), current_user),
        )
        conn.commit()
