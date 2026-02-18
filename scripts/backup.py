#!/usr/bin/env python3
"""Backup vault.db to Cloudflare R2 (S3-compatible)."""

import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = os.environ.get("DB_PATH", "/data/vault.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", "/data/backups")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")


def local_backup():
    """Create a local backup using SQLite online backup API."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"vault_{timestamp}.db")

    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(backup_path)
    src.backup(dst)
    dst.close()
    src.close()

    print(f"Local backup created: {backup_path}")
    return backup_path


def upload_to_r2(file_path):
    """Upload backup to Cloudflare R2."""
    if not all([R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY]):
        print("R2 credentials not configured, skipping remote backup")
        return

    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT,
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
        )
        key = f"backups/{os.path.basename(file_path)}"
        s3.upload_file(file_path, R2_BUCKET, key)
        print(f"Uploaded to R2: {key}")
    except Exception as e:
        print(f"R2 upload failed: {e}")


def cleanup_old_backups(keep=7):
    """Keep only the latest N local backups."""
    if not os.path.exists(BACKUP_DIR):
        return
    backups = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith("vault_") and f.endswith(".db")]
    )
    for old in backups[:-keep]:
        os.remove(os.path.join(BACKUP_DIR, old))
        print(f"Removed old backup: {old}")


if __name__ == "__main__":
    backup_path = local_backup()
    upload_to_r2(backup_path)
    cleanup_old_backups()
    print("Backup complete!")
