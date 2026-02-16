"""Pydantic schemas per request/response dell'API."""

from typing import Annotated

from pydantic import BaseModel, BeforeValidator


def _parse_tags(v):
    """Converte tags comma-separated da SQLite in lista Python."""
    if isinstance(v, str):
        return [t.strip() for t in v.split(",") if t.strip()]
    if v is None:
        return []
    return v


TagList = Annotated[list[str], BeforeValidator(_parse_tags)]


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DocumentCreate(BaseModel):
    title: str
    content: str
    project: str | None = None
    tags: str | None = None


class DocumentUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    project: str | None = None
    tags: str | None = None


class DocumentResponse(BaseModel):
    id: int
    title: str
    content: str
    project: str | None = None
    tags: TagList
    file_name: str | None = None
    file_type: str | None = None
    created_at: str
    updated_at: str


class DocumentListItem(BaseModel):
    id: int
    title: str
    project: str | None = None
    tags: TagList
    file_name: str | None = None
    file_type: str | None = None
    created_at: str
    updated_at: str


class SearchResult(BaseModel):
    id: int
    title: str
    snippet: str
    project: str | None = None
    tags: TagList
