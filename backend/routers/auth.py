"""Router autenticazione: login e cambio password."""

from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth import create_token, get_current_user, hash_password, verify_password
from backend.database import get_connection
from backend.models import LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    conn = get_connection()
    row = conn.execute(
        "SELECT username, password_hash FROM users WHERE username = ?",
        (body.username,),
    ).fetchone()
    conn.close()

    if not row or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

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
    conn = get_connection()
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE username = ?",
        (hash_password(body.password), current_user),
    )
    conn.commit()
    conn.close()
