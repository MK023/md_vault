"""Configurazione da variabili d'ambiente."""

import os

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
DB_PATH = os.environ.get("DB_PATH", "/data/vault.db")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/data/uploads")
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")
