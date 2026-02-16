# MD Vault

A self-hosted Markdown knowledge base with full-text search, served through a Cloudflare Tunnel on a single GCE instance running K3s. Features a nostalgic Windows 95-inspired UI.

## Architecture Overview

```
                         Internet
                            |
                    Cloudflare Tunnel
                            |
                  +-------------------+
                  |  GCE Instance     |
                  |  (K3s Cluster)    |
                  |                   |
                  |  Nginx Ingress    |
                  |    /         \    |
                  | Frontend    API   |
                  | (Nginx)  (FastAPI)|
                  |              |    |
                  |           SQLite  |
                  |          (FTS5)   |
                  +-------------------+
```

**Request flow:** Browser --> Cloudflare Tunnel --> K3s Nginx Ingress --> Frontend / API pods --> SQLite database

## Tech Stack

| Component       | Technology                        |
|-----------------|-----------------------------------|
| **Backend API** | Python FastAPI + Sentry           |
| **Database**    | SQLite with FTS5 full-text search |
| **Frontend**    | Vanilla JS with Windows 95 UI     |
| **Orchestration** | K3s (lightweight Kubernetes)   |
| **Infrastructure** | Terraform (Google Cloud)      |
| **Networking**  | Cloudflare Tunnel (Zero Trust)    |
| **Backups**     | Cloudflare R2 (S3-compatible)     |
| **CI/CD**       | GitHub Actions                    |

## Prerequisites

- **Google Cloud** account with a project created (`gcloud auth login`)
- **Cloudflare account** with a registered domain and API token
- **Terraform** >= 1.5 installed locally
- **Docker** installed locally (for building images)
- **SSH key pair** for VM access

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/MK023/md_vault.git
   cd md_vault
   ```

2. **Configure Terraform variables**

   ```bash
   cd terraform
   cat > terraform.tfvars <<EOF
   gcp_project          = "mdvault"
   gcp_region           = "europe-west8"
   gcp_zone             = "europe-west8-a"
   machine_type         = "e2-small"
   domain               = "mdvault.site"
   cloudflare_api_token = "your-cloudflare-api-token"
   cloudflare_account_id = "your-cloudflare-account-id"
   cloudflare_zone_id   = "your-cloudflare-zone-id"
   ssh_public_key       = "ssh-ed25519 AAAA..."
   ssh_allowed_ip       = "your.ip.address/32"
   EOF
   ```

3. **Provision the infrastructure**

   ```bash
   terraform init
   terraform apply
   cd ..
   ```

   This creates a GCE instance with K3s pre-installed via startup script.

4. **SSH into the GCE instance**

   ```bash
   ssh -i ~/.ssh/md-vault mdvault@<GCE_PUBLIC_IP>
   ```

5. **Configure Kubernetes secrets**

   ```bash
   cp k8s/secrets.yaml.example k8s/secrets.yaml
   nano k8s/secrets.yaml
   # Fill in: JWT_SECRET, ADMIN_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN, R2_ENDPOINT, SENTRY_DSN
   ```

6. **Deploy the application**

   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```

7. **Access your vault**

   Open your browser and navigate to `https://mdvault.site`.

## Local Development

### With Docker Compose

```bash
docker-compose up --build
# API at http://localhost:8000, Frontend at http://localhost:3000
```

### API only

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

### Frontend only

```bash
cd frontend
python -m http.server 3000
```

## Project Structure

```
md_vault/
  api/                          # FastAPI backend
    main.py                     # App entry point + Sentry
    config.py                   # Env var configuration
    database.py                 # SQLite + FTS5 setup
    auth.py                     # JWT + bcrypt auth
    models.py                   # Pydantic schemas
    routers/
      auth.py                   # Login, password change
      documents.py              # CRUD + file upload
      search.py                 # Full-text search
    Dockerfile
    requirements.txt
  frontend/                     # Vanilla JS frontend (Win95 UI)
    index.html
    style.css
    app.js
    nginx.conf
    Dockerfile
  k8s/                          # Kubernetes manifests
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
  terraform/                    # Infrastructure as Code (GCP)
    providers.tf
    variables.tf
    vpc.tf
    firewall.tf
    compute.tf
    cloudflare.tf
    gcs_backend.tf
    outputs.tf
    scripts/
      startup.sh
  scripts/
    deploy.sh                   # Full deploy pipeline
    backup.py                   # SQLite backup to R2
  docs/
    architettura.md             # Technical documentation (IT)
    architettura.drawio         # Architecture diagram
  .github/
    workflows/
      ci.yml                    # CI pipeline (lint, build, validate)
  docker-compose.yml
  pyproject.toml
  .gitignore
```

## API Endpoints

| Method   | Endpoint              | Description                          | Auth |
|----------|-----------------------|--------------------------------------|------|
| `POST`   | `/api/auth/login`     | Login, returns JWT token             | No   |
| `PUT`    | `/api/auth/password`  | Change password                      | Yes  |
| `GET`    | `/api/docs`           | List all documents                   | Yes  |
| `POST`   | `/api/docs`           | Create a document (JSON)             | Yes  |
| `POST`   | `/api/docs/upload`    | Upload a file (multipart)            | Yes  |
| `GET`    | `/api/docs/{id}`      | Get document by ID                   | Yes  |
| `GET`    | `/api/docs/{id}/file` | Download original file               | Yes  |
| `PUT`    | `/api/docs/{id}`      | Update document                      | Yes  |
| `DELETE` | `/api/docs/{id}`      | Delete document + file               | Yes  |
| `GET`    | `/api/docs/meta/tags` | List all unique tags                 | Yes  |
| `GET`    | `/api/search?q=`      | Full-text search (FTS5)              | Yes  |
| `GET`    | `/api/healthz`        | Health check                         | No   |

## Backup Strategy

Backups run automatically via Kubernetes CronJob at 03:00 UTC daily:

- **Local backup** using the SQLite online backup API (consistent, no locking)
- **Remote backup** uploaded to Cloudflare R2 (S3-compatible storage)
- **Retention** keeps the latest 7 local backups

Manual backup:
```bash
kubectl exec deployment/md-vault-api -n md-vault -- python /app/backup.py
```

## License

MIT License

Copyright (c) 2026 Marco Bellingeri
