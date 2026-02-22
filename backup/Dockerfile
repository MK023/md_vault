FROM python:3.11-slim

RUN pip install --no-cache-dir boto3 && \
    adduser --disabled-password --gecos "" backupuser

COPY backup.py /app/backup.py

USER backupuser

ENTRYPOINT ["python", "/app/backup.py"]
