"""Router ricerca full-text con SQLite FTS5."""

from fastapi import APIRouter, Depends, Query

from api.auth import get_current_user
from api.database import get_connection
from api.models import SearchResult

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=list[SearchResult])
def search(
    q: str = Query(..., min_length=1),
    _user: str = Depends(get_current_user),
):
    conn = get_connection()
    rows = conn.execute(
        """
        SELECT
            d.id,
            d.title,
            snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet,
            d.project,
            d.tags
        FROM documents_fts
        JOIN documents d ON d.id = documents_fts.rowid
        WHERE documents_fts MATCH ?
        ORDER BY rank
        LIMIT 50
        """,
        (q,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
