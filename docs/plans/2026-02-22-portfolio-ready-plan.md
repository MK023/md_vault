# MD Vault Portfolio-Ready Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Elevate MD Vault to a portfolio-grade project demonstrating both Dev and DevOps skills.

**Architecture:** Add pytest test suite for all API endpoints, replace raw K8s manifests with a Helm chart, split the monolithic frontend into ES6 modules, enable Swagger/OpenAPI docs, fix the backup CronJob with a dedicated Docker image, and update all documentation.

**Tech Stack:** pytest + httpx (testing), Helm 3 (K8s packaging), ES6 modules (frontend), FastAPI OpenAPI (docs)

**Security note:** All frontend code uses DOMPurify.sanitize() before any DOM insertion. The createSanitizedFragment helper only receives pre-sanitized input.

---

## Tasks

### Task 1: Backend test infrastructure
- Create `backend/tests/__init__.py`, `backend/tests/conftest.py`
- Add pytest + httpx to `backend/requirements.txt`
- Add pytest config to `pyproject.toml`
- Fixtures: tmp DB, TestClient, auth_header

### Task 2: Auth tests
- Create `backend/tests/test_auth.py`
- Tests: login success/failure, rate limiting, password change, token validation

### Task 3: Document CRUD tests
- Create `backend/tests/test_documents.py`
- Tests: list, create, get, update, delete, file upload/download, tags

### Task 4: Search and healthz tests
- Create `backend/tests/test_search.py`
- Tests: FTS5 search, edge cases, healthz, system-info

### Task 5: Enable Swagger/OpenAPI
- Modify `backend/main.py`: DOCS_ENABLED default to "true"
- Add API description metadata

### Task 6: Backup Docker image
- Create `backup/Dockerfile` with boto3 pre-installed
- Copy `scripts/backup.py` to `backup/backup.py`

### Task 7: Frontend ES6 module split
- Create `frontend/js/` with: state.js, api.js, auth.js, documents.js, tree.js, windows.js, app.js
- Update `frontend/index.html`: script type="module"
- Update `frontend/Dockerfile`: copy js/ directory
- Update `frontend/nginx.conf`: serve JS modules
- Delete `frontend/app.js`

### Task 8: Helm chart
- Create `helm/md-vault/` with Chart.yaml, values.yaml, values-local.yaml
- Templates for all K8s resources with configurable values
- Conditional cloudflared and backup components
- Backup cronjob uses dedicated image (no pip install at runtime)

### Task 9: Update deployment scripts
- Modify `scripts/deploy.sh` to use `helm upgrade --install`

### Task 10: Update CI workflow
- Add pytest test job to `.github/workflows/ci.yml`
- Add Helm lint step
- Update job dependencies

### Task 11: Update documentation
- Update `README.md` with testing, Helm, Swagger, module architecture
- Update `docs/architettura.md` with new technical decisions

### Task 12: Final verification and push
- Run tests, linters, Helm lint
- Build all Docker images
- Push to GitHub

---

See design doc for full details: `docs/plans/2026-02-22-portfolio-ready-design.md`
