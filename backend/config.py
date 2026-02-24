"""Configurazione da variabili d'ambiente."""

import logging
import os

logger = logging.getLogger(__name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me-in-production")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin")
DB_PATH = os.environ.get("DB_PATH", "/data/vault.db")
JWT_EXPIRY_HOURS = int(os.environ.get("JWT_EXPIRY_HOURS", "24"))
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/data/uploads")
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

if JWT_SECRET == "change-me-in-production":  # nosec B105
    logger.warning("JWT_SECRET is using the default value — set a secure secret in production")
if ADMIN_PASSWORD == "admin":  # nosec B105
    logger.warning("ADMIN_PASSWORD is 'admin' — set a strong password in production")
