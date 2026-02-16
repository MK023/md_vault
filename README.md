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
| Frontend         | Vanilla JS/CSS (Win95 theme)       |
| Orchestration    | K3s via k3d (local) or native      |
| Infrastructure   | Terraform (Google Cloud)           |
| Networking       | Cloudflare Tunnel (Zero Trust)     |
| CI/CD            | GitHub Actions                     |
| Monitoring       | Sentry                             |
| Backups          | CronJob + Cloudflare R2            |

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
    Dockerfile
    requirements.txt
  frontend/                 # Win95 UI (zero build step)
    index.html
    style.css
    app.js
    nginx.conf
    Dockerfile
  k8s/                      # Kubernetes manifests
    namespace.yaml
    secrets.yaml.example
    configmap.yaml
    pv-pvc.yaml
    api-deployment.yaml
    api-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
    cloudflared-deployment.yaml
    ingress.yaml
    backup-cronjob.yaml
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
    deploy.sh               # Build + deploy (auto-detects k3d/k3s)
    backup.py               # SQLite backup to R2
  docs/
    architettura.md         # Technical documentation (Italian)
    architettura.drawio     # Architecture diagram
```

## Local Development (k3d)

Run the full stack locally with k3d (K3s in Docker). Zero cloud costs, same K8s manifests as production.

### Prerequisites

- Docker Desktop running
- k3d installed (`brew install k3d` or [direct download](https://k3d.io))
- kubectl installed

### Quick Start

```bash
# 1. Start the cluster (creates it on first run)
./scripts/start.sh

# 2. Create secrets
cp k8s/secrets.yaml.example k8s/secrets.yaml
# Edit k8s/secrets.yaml with your values

# 3. Build and deploy
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
cp k8s/secrets.yaml.example k8s/secrets.yaml
# Edit secrets with: JWT_SECRET, ADMIN_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN
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

## API Endpoints

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
| `GET`    | `/api/healthz`        | Health check             | No   |

## Key Features

- **Full-text search** via SQLite FTS5 with BM25 ranking and highlighted snippets
- **File upload** supporting MD, PDF, DOCX, XLSX, images, draw.io (max 50MB)
- **Integrated viewers** for PDF (PDF.js), DOCX (mammoth.js), spreadsheets (SheetJS), draw.io diagrams
- **Tree explorer** with drag & drop between folders, context menu for rename/delete
- **JWT auth** with bcrypt password hashing, 24h token expiry
- **Automatic backups** via K8s CronJob to Cloudflare R2
- **XSS prevention** with DOMPurify on all rendered HTML
- **Path traversal protection** on file downloads

## License

MIT License - Copyright (c) 2026 Marco Bellingeri
