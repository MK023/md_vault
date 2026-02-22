# MD Vault — Portfolio-Ready Design

**Date:** 2026-02-22
**Goal:** Elevate MD Vault to a portfolio-grade project demonstrating both Dev and DevOps skills.

## Changes

### 1. Backend Testing (pytest + httpx)

Add ~25-30 tests covering all API routes with in-memory SQLite.

```
backend/tests/
├── conftest.py          # Fixtures: test DB, test client, auth token
├── test_auth.py         # JWT, bcrypt, login, rate limiting
├── test_documents.py    # CRUD, file upload/download, path traversal protection
└── test_search.py       # FTS5 search, edge cases
```

CI updated to run tests before linting.

### 2. Helm Chart

Replace 11 raw K8s manifests with a parameterized Helm chart.

```
helm/md-vault/
├── Chart.yaml
├── values.yaml              # Production defaults
├── values-local.yaml        # k3d overrides
└── templates/
    ├── _helpers.tpl
    ├── namespace.yaml
    ├── secrets.yaml
    ├── configmap.yaml
    ├── pv-pvc.yaml
    ├── api-deployment.yaml
    ├── api-service.yaml
    ├── frontend-deployment.yaml
    ├── frontend-service.yaml
    ├── ingress.yaml
    ├── cloudflared.yaml     # Conditional: .Values.tunnel.enabled
    └── backup-cronjob.yaml
```

Deployment scripts updated to use `helm install/upgrade`.

### 3. Backup CronJob Fix

Dedicated Docker image `md-vault-backup` with boto3 baked in. No more `pip install` at runtime.

### 4. Swagger/OpenAPI

Enable FastAPI auto-generated docs at `/docs` with proper metadata, tags, and descriptions.

### 5. Frontend ES6 Modules

Split monolithic app.js (1496 lines) into focused modules:

```
frontend/js/
├── app.js           # Init, event listeners, orchestration
├── api.js           # apiFetch(), all HTTP calls
├── auth.js          # Login flow, token management, password change
├── documents.js     # Document CRUD, markdown/file rendering, viewers
├── tree.js          # Tree navigation, drag-drop, context menu
└── windows.js       # Window management, minimize/maximize, resize, desktop icons
```

- `<script type="module">` in index.html
- Zero build step, native ES6 modules served by Nginx
- Each module exports only what others need

### 6. Documentation

- README.md: updated with Helm usage, test commands, module architecture
- docs/architettura.md: updated with new technical decisions
- CLAUDE.md: project memory for AI-assisted development

## Non-Goals

- No frontend framework migration (vanilla JS is intentional)
- No database migration (SQLite FTS5 is the right choice for single-user)
- No multi-user support
- No Fly.io/cloud migration (stays GCP + local)
