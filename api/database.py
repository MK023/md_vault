"""Inizializzazione SQLite con FTS5 e schema migration."""

import os
import sqlite3

import bcrypt

from api.config import ADMIN_PASSWORD, DB_PATH


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = get_connection()
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

    columns = [row[1] for row in cur.execute("PRAGMA table_info(documents)").fetchall()]
    if "file_name" not in columns:
        cur.execute("ALTER TABLE documents ADD COLUMN file_name TEXT")
        cur.execute("ALTER TABLE documents ADD COLUMN file_type TEXT")

    existing = cur.execute("SELECT id FROM users WHERE username = ?", ("admin",)).fetchone()
    if not existing:
        hashed = bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt())
        cur.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("admin", hashed.decode()),
        )

    conn.commit()
    conn.close()
