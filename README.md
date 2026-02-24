# MD Vault

A self-hosted personal knowledge base with full-text search, file management, and a nostalgic Windows 95 UI. Runs on K3s (locally via k3d or on a cloud VM) with Cloudflare Tunnel for secure HTTPS access.

## Architecture

```
                          Internet
                             |
                     Cloudflare Tunnel
                     (zero open ports)
                             |
                +------------------------+
                |     K3s Cluster         |
                |                        |
                |   Nginx Ingress        |
                |     /          \       |
                |  Frontend      API     |
                |  (nginx)    (FastAPI)  |
                |               |        |
                |            SQLite      |
                |           (FTS5)       |
                +------------------------+
```

## Tech Stack

| Layer            | Technology                         |
|------------------|------------------------------------|
| Backend          | FastAPI, SQLite FTS5, JWT + bcrypt  |
| Frontend         | Vanilla JS/CSS (Win95 theme), ES6 modules |
| Testing          | pytest + httpx (38 tests)          |
| Orchestration    | K3s via k3d (local) or native      |
| Packaging        | Helm 3 chart                       |
| Infrastructure   | Terraform (Google Cloud)           |
| Networking       | Cloudflare Tunnel (Zero Trust)     |
| CI/CD            | GitHub Actions                     |
| Monitoring       | Sentry                             |
| Backups          | CronJob + Cloudflare R2            |
| API Docs         | Swagger/OpenAPI (FastAPI auto-generated) |

## Project Structure

```
md_vault/
  backend/                  # FastAPI backend
    main.py                 # App entry point + Sentry init
    config.py               # Env var configuration
    database.py             # SQLite + FTS5 schema + migrations
    auth.py                 # JWT + bcrypt authentication
    models.py               # Pydantic request/response schemas
    routers/
      auth.py               # Login + password change
      documents.py          # CRUD + file upload/download
      search.py             # Full-text search
    tests/                  # pytest test suite
      conftest.py           # Fixtures: test DB, test client, auth token
      test_auth.py          # JWT, bcrypt, login, rate limiting
      test_documents.py     # CRUD, file upload/download, tags
      test_search.py        # FTS5 search, edge cases, healthz
    Dockerfile
    requirements.txt
  frontend/                 # Win95 UI (zero build step)
    index.html
    style.css
    js/                     # ES6 modules (native, no bundler)
      app.js                # Init, event listeners, orchestration
      api.js                # apiFetch(), all HTTP calls
      auth.js               # Login flow, token management
      documents.js          # Document CRUD, viewers, rendering
      tree.js               # Tree navigation, drag-drop, context menu
      windows.js            # Window management, minimize/maximize, resize
      state.js              # Shared application state
    nginx.conf
    Dockerfile
  helm/                     # Helm 3 chart
    md-vault/
      Chart.yaml
      values.yaml           # Production defaults
      values-local.yaml     # k3d overrides
      templates/            # All K8s resources as templates
  backup/                   # Dedicated backup Docker image
    Dockerfile              # python:3.11-slim + boto3
    backup.py               # SQLite backup to R2
  terraform/                # IaC (Google Cloud)
    providers.tf
    variables.tf
    vpc.tf
    firewall.tf
    compute.tf
    cloudflare.tf
    gcs_backend.tf
    outputs.tf
    scripts/startup.sh
  scripts/
    start.sh                # Start k3d cluster
    stop.sh                 # Graceful shutdown
    deploy.sh               # Build + Helm deploy (auto-detects k3d/k3s)
    backup.py               # SQLite backup to R2
  docs/
    architettura.md         # Technical documentation (Italian)
    architettura.drawio     # Architecture diagram
  Makefile                  # Project commands (make help)
```

## Quick Reference (Makefile)

```bash
make help            # Show all commands
make test            # Run pytest (38 tests)
make lint            # Run all linters
make fmt             # Auto-format code
make build           # Build all Docker images
make deploy          # Build + Helm deploy
make start / stop    # Cluster lifecycle
make status          # Pod status
make logs            # Tail API logs
make up / down       # Docker Compose
```

## Testing

The backend has a comprehensive pytest test suite with 38 tests covering all API endpoints.

```bash
make test                                    # Run all tests
python -m pytest backend/tests/test_auth.py -v  # Run specific file
```

**Test coverage:**

| Module          | Tests | Coverage                                         |
|-----------------|-------|--------------------------------------------------|
| `test_auth.py`      | 12 | Login success/failure, rate limiting, password change, token validation |
| `test_documents.py` | 16 | CRUD operations, file upload/download, tags, path traversal protection |
| `test_search.py`    | 10 | FTS5 search, edge cases, healthz, system-info    |

Tests use an in-memory SQLite database with isolated fixtures (`importlib.reload` pattern) for full test isolation.

## Local Development (k3d + Helm)

Run the full stack locally with k3d (K3s in Docker). Zero cloud costs, same Helm chart as production.

### Prerequisites

- Docker Desktop running
- k3d installed (`brew install k3d` or [direct download](https://k3d.io))
- kubectl installed
- Helm 3 installed (`brew install helm`)

### Quick Start

```bash
# 1. Start the cluster (creates it on first run)
./scripts/start.sh

# 2. Configure secrets in Helm values
# Edit helm/md-vault/values-local.yaml with your JWT_SECRET, ADMIN_PASSWORD, etc.

# 3. Build and deploy with Helm
./scripts/deploy.sh

# 4. Open http://localhost
# Default login: admin / admin

# 5. When done, graceful shutdown
./scripts/stop.sh
```

### Daily Workflow

```bash
./scripts/start.sh    # Start (2-3 seconds if cluster exists)
./scripts/deploy.sh   # Rebuild after code changes
./scripts/stop.sh     # Stop (zero CPU/RAM when off)
```

### Helm Usage

```bash
# Deploy with production values
helm upgrade --install md-vault helm/md-vault

# Deploy with local (k3d) overrides
helm upgrade --install md-vault helm/md-vault -f helm/md-vault/values-local.yaml

# Dry-run to inspect rendered templates
helm template md-vault helm/md-vault -f helm/md-vault/values-local.yaml

# Uninstall
helm uninstall md-vault
```

## Cloud Deployment (GCP + K3s)

For production: a GCE e2-small in europe-west8 (Milan) running K3s natively, exposed via Cloudflare Tunnel.

### Prerequisites

- Google Cloud account with project created
- Cloudflare account with domain and API token
- Terraform >= 1.5

### Deploy

```bash
# 1. Provision infrastructure
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values
terraform init && terraform apply

# 2. SSH into the VM
ssh -i ~/.ssh/md-vault mdvault@<GCE_PUBLIC_IP>

# 3. Clone, configure secrets, deploy
git clone https://github.com/MK023/md_vault.git && cd md_vault
# Edit helm/md-vault/values.yaml with: JWT_SECRET, ADMIN_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN
./scripts/deploy.sh

# 4. Access via https://mdvault.site
```

## Docker Compose (simple local dev)

For quick backend testing without K8s:

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:8080
```

## API Documentation

Interactive API docs are available at `/api/docs` (Swagger UI) when the application is running. Powered by FastAPI auto-generated OpenAPI.

Disable in production with `DOCS_ENABLED=false`.

### Endpoints

| Method   | Endpoint              | Description              | Auth |
|----------|-----------------------|--------------------------|------|
| `POST`   | `/api/auth/login`     | Login, returns JWT       | No   |
| `PUT`    | `/api/auth/password`  | Change password          | Yes  |
| `GET`    | `/api/docs`           | List documents           | Yes  |
| `POST`   | `/api/docs`           | Create document          | Yes  |
| `POST`   | `/api/docs/upload`    | Upload file              | Yes  |
| `GET`    | `/api/docs/{id}`      | Get document             | Yes  |
| `GET`    | `/api/docs/{id}/file` | Download file            | Yes  |
| `PUT`    | `/api/docs/{id}`      | Update document          | Yes  |
| `DELETE` | `/api/docs/{id}`      | Delete document + file   | Yes  |
| `GET`    | `/api/docs/meta/tags` | List unique tags         | Yes  |
| `GET`    | `/api/search?q=`      | Full-text search (FTS5)  | Yes  |
| `GET`    | `/api/system-info`    | Server specs (auth)      | Yes  |
| `GET`    | `/api/healthz`        | Health check             | No   |

## Key Features

- **Full-text search** via SQLite FTS5 with BM25 ranking and highlighted snippets
- **File upload** supporting MD, PDF, DOCX, XLSX, images, draw.io (max 50MB)
- **Integrated viewers** for PDF (PDF.js), DOCX (mammoth.js), spreadsheets (SheetJS), draw.io diagrams
- **Tree explorer** with drag & drop between folders, context menu for rename/delete
- **JWT auth** with bcrypt password hashing, 24h token expiry, per-IP rate limiting on login
- **Automatic backups** via K8s CronJob with dedicated Docker image to Cloudflare R2
- **XSS prevention** with DOMPurify on all rendered HTML
- **Path traversal protection** on file downloads
- **Lazy loading** of heavy JS libs (PDF.js, mammoth, SheetJS) on first use
- **ES6 modules** frontend split into focused modules (zero build step, native browser modules)
- **Helm chart** for parameterized K8s deployment with configurable values
- **Swagger/OpenAPI** auto-generated interactive API documentation
- **Win95 desktop** with minimize/maximize, desktop icons (System Properties, Recycle Bin)

## CI Pipeline

```
lint --> test --> build-api
build-frontend (parallel)
build-backup (parallel)
validate-helm (parallel)
validate-terraform (parallel)
```

| Job               | Description                                    |
|-------------------|------------------------------------------------|
| `lint`            | Black, isort, Flake8, Bandit, Mypy             |
| `test`            | pytest (38 tests, in-memory SQLite)            |
| `build-api`       | Docker build backend image                     |
| `build-frontend`  | Docker build frontend image                    |
| `build-backup`    | Docker build backup image                      |
| `validate-helm`   | Helm lint chart                                |
| `validate-terraform` | fmt, init, validate                         |

## License

MIT License - Copyright (c) 2026 Marco Bellingeri
