"""Inizializzazione SQLite con FTS5 e schema migration."""

import os
import sqlite3
from contextlib import contextmanager

import bcrypt

from backend.config import ADMIN_PASSWORD, DB_PATH


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def init_db():
    if sqlite3.sqlite_version_info < (3, 35, 0):
        raise RuntimeError(
            f"SQLite >= 3.35.0 required (RETURNING clause), found {sqlite3.sqlite_version}"
        )
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")

        cur = conn.cursor()

        cur.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                project TEXT,
                tags TEXT,
                file_name TEXT,
                file_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        try:
            cur.execute("""
                CREATE VIRTUAL TABLE documents_fts USING fts5(
                    title, content, project, tags,
                    content=documents, content_rowid=id
                )
            """)
        except sqlite3.OperationalError:
            pass

        cur.executescript("""
            CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, title, content, project, tags)
                VALUES (new.id, new.title, new.content, new.project, new.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, title, content, project, tags)
                VALUES ('delete', old.id, old.title, old.content, old.project, old.tags);
            END;

            CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, title, content, project, tags)
                VALUES ('delete', old.id, old.title, old.content, old.project, old.tags);
                INSERT INTO documents_fts(rowid, title, content, project, tags)
                VALUES (new.id, new.title, new.content, new.project, new.tags);
            END;
        """)

        # Indices for performance
        cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_updated ON documents(updated_at DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project)")

        columns = [row[1] for row in cur.execute("PRAGMA table_info(documents)").fetchall()]
        if "file_name" not in columns:
            cur.execute("ALTER TABLE documents ADD COLUMN file_name TEXT")
            cur.execute("ALTER TABLE documents ADD COLUMN file_type TEXT")

        existing = cur.execute("SELECT id, password_hash FROM users WHERE username = ?", ("admin",)).fetchone()
        if not existing:
            hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
            cur.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("admin", hashed.decode()),
            )
        else:
            # Update password if env var changed
            if not bcrypt.checkpw(ADMIN_PASSWORD.encode(), existing["password_hash"].encode()):
                hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
                cur.execute(
                    "UPDATE users SET password_hash = ? WHERE username = ?",
                    (hashed.decode(), "admin"),
                )

        conn.commit()
