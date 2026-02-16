"""Router CRUD documenti con upload file e gestione tags."""

import mimetypes
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from api.auth import get_current_user
from api.config import UPLOAD_DIR
from api.database import get_connection
from api.models import DocumentCreate, DocumentListItem, DocumentResponse, DocumentUpdate

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
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, title, project, tags, file_name, file_type, "
        "created_at, updated_at FROM documents ORDER BY updated_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(doc: DocumentCreate, _user: str = Depends(get_current_user)):
    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO documents (title, content, project, tags) VALUES (?, ?, ?, ?)",
        (doc.title, doc.content, doc.project, doc.tags),
    )
    doc_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return dict(row)


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    project: str = Form(default=None),
    tags: str = Form(default=None),
    _user: str = Depends(get_current_user),
):
    ext = os.path.splitext(file.filename)[1].lower()
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

    file_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    title = os.path.splitext(file.filename)[0]

    conn = get_connection()
    cur = conn.execute(
        "INSERT INTO documents (title, content, project, tags, file_name, file_type) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (title, content, project, tags, file.filename, file_type),
    )
    doc_id = cur.lastrowid
    conn.commit()

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(data)

    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return dict(row)


@router.get("/{doc_id}/file")
def get_document_file(doc_id: int, _user: str = Depends(get_current_user)):
    conn = get_connection()
    row = conn.execute(
        "SELECT file_name, file_type FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()
    conn.close()
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
    conn = get_connection()
    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return dict(row)


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: int,
    doc: DocumentUpdate,
    _user: str = Depends(get_current_user),
):
    conn = get_connection()
    existing = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not existing:
        conn.close()
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
        conn.execute(
            f"UPDATE documents SET {set_clause}, updated_at = CURRENT_TIMESTAMP "  # noqa: S608
            "WHERE id = ?",
            values + [doc_id],
        )
        conn.commit()

    row = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
    conn.close()
    return dict(row)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(doc_id: int, _user: str = Depends(get_current_user)):
    conn = get_connection()
    existing = conn.execute("SELECT file_name FROM documents WHERE id = ?", (doc_id,)).fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()

    if existing["file_name"]:
        file_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{existing['file_name']}")
        if os.path.exists(file_path):
            os.remove(file_path)


@router.get("/meta/tags", response_model=list[str])
def list_tags(_user: str = Depends(get_current_user)):
    conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT tags FROM documents WHERE tags IS NOT NULL AND tags != ''"
    ).fetchall()
    conn.close()
    all_tags = set()
    for row in rows:
        for tag in row["tags"].split(","):
            tag = tag.strip()
            if tag:
                all_tags.add(tag)
    return sorted(all_tags)
