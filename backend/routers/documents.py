"""Router CRUD documenti con upload file e gestione tags."""

import asyncio
import mimetypes
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from backend.auth import get_current_user
from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.models import DocumentCreate, DocumentListItem, DocumentResponse, DocumentUpdate

router = APIRouter(prefix="/api/docs", tags=["documents"])

ALLOWED_EXTENSIONS = {
    ".md",
    ".txt",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".htm",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".drawio",
}
TEXT_EXTENSIONS = {
    ".md",
    ".txt",
    ".csv",
    ".json",
    ".yaml",
    ".yml",
    ".xml",
    ".html",
    ".htm",
    ".drawio",
}
MAX_FILE_SIZE = 50 * 1024 * 1024


@router.get("", response_model=list[DocumentListItem])
def list_documents(_user: str = Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, project, tags, file_name, file_type, "
            "created_at, updated_at FROM documents ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(doc: DocumentCreate, _user: str = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "INSERT INTO documents (title, content, project, tags)"
            " VALUES (?, ?, ?, ?) RETURNING *",
            (doc.title, doc.content, doc.project, doc.tags),
        ).fetchone()
        conn.commit()
    return dict(row)


def _write_file(file_path: str, data: bytes):
    with open(file_path, "wb") as f:
        f.write(data)


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    project: str = Form(default=None),
    tags: str = Form(default=None),
    _user: str = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    safe_name = os.path.basename(file.filename)
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not supported")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    content = ""
    if ext in TEXT_EXTENSIONS:
        try:
            content = data.decode("utf-8", errors="replace")
        except Exception:
            content = ""

    file_type = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
    title = os.path.splitext(safe_name)[0]

    with get_db() as conn:
        row = conn.execute(
            "INSERT INTO documents (title, content, project, tags, file_name, file_type) "
            "VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
            (title, content, project, tags, safe_name, file_type),
        ).fetchone()
        conn.commit()
        doc_id = row["id"]

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{safe_name}")
    await asyncio.to_thread(_write_file, file_path, data)

    return dict(row)


@router.get("/{doc_id}/file")
def get_document_file(doc_id: int, _user: str = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT file_name, file_type FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
    if not row or not row["file_name"]:
        raise HTTPException(status_code=404, detail="No file attached")

    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{row['file_name']}")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    real_path = os.path.realpath(file_path)
    if not real_path.startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(
        real_path,
        media_type=row["file_type"],
        filename=row["file_name"],
    )


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: int, _user: str = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return dict(row)


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: int,
    doc: DocumentUpdate,
    _user: str = Depends(get_current_user),
):
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM documents WHERE id = ?", (doc_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        updates = {}
        if doc.title is not None:
            updates["title"] = doc.title
        if doc.content is not None:
            updates["content"] = doc.content
        if doc.project is not None:
            updates["project"] = doc.project
        if doc.tags is not None:
            updates["tags"] = doc.tags

        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values())
            row = conn.execute(
                f"UPDATE documents SET {set_clause}, updated_at = CURRENT_TIMESTAMP "  # noqa: S608
                "WHERE id = ? RETURNING *",
                values + [doc_id],
            ).fetchone()
            conn.commit()
        else:
            row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()

    return dict(row)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: int, _user: str = Depends(get_current_user)):
    with get_db() as conn:
        existing = conn.execute(
            "SELECT file_name FROM documents WHERE id = ?", (doc_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()

    if existing["file_name"]:
        file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{existing['file_name']}")
        if os.path.exists(file_path):
            os.remove(file_path)


@router.get("/meta/tags", response_model=list[str])
def list_tags(_user: str = Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT tags FROM documents WHERE tags IS NOT NULL AND tags != ''"
        ).fetchall()
    all_tags = set()
    for row in rows:
        for tag in row["tags"].split(","):
            tag = tag.strip()
            if tag:
                all_tags.add(tag)
    return sorted(all_tags)
