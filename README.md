# MD Vault

A self-hosted Markdown note-taking application with full-text search, served through a Cloudflare Tunnel on a single EC2 instance running K3s. Features a nostalgic Windows 95-inspired UI.

## Architecture Overview

```
                         Internet
                            |
                    Cloudflare Tunnel
                            |
                  +-------------------+
                  |   EC2 Instance    |
                  |   (K3s Cluster)   |
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
| **Backend API** | Python FastAPI                    |
| **Database**    | SQLite with FTS5 full-text search |
| **Frontend**    | Vanilla JS with Windows 95 UI     |
| **Orchestration** | K3s (lightweight Kubernetes)   |
| **Infrastructure** | Terraform (AWS EC2)           |
| **Networking**  | Cloudflare Tunnel (Zero Trust)    |
| **Backups**     | Cloudflare R2 (S3-compatible)     |

## Prerequisites

- **AWS account** with credentials configured (`aws configure`)
- **Cloudflare account** with a registered domain and Tunnel token
- **Terraform** >= 1.5 installed locally
- **Docker** installed locally (for building images)
- **SSH key pair** for EC2 access

## Quick Start

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/md-vault.git
   cd md-vault
   ```

2. **Configure Terraform variables**

   ```bash
   cp terraform/terraform.tfvars.example terraform/terraform.tfvars
   ```

   Edit `terraform/terraform.tfvars` and fill in your AWS region, instance type, SSH key name, and Cloudflare Tunnel token.

3. **Provision the infrastructure**

   ```bash
   cd terraform
   terraform init
   terraform apply
   cd ..
   ```

   This creates an EC2 instance with K3s pre-installed via user-data.

4. **SSH into the EC2 instance**

   ```bash
   ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_PUBLIC_IP>
   ```

5. **Configure Kubernetes secrets**

   ```bash
   cp k8s/secrets.yaml.example k8s/secrets.yaml
   ```

   Edit `k8s/secrets.yaml` and fill in your base64-encoded Cloudflare Tunnel token and any other secrets.

6. **Deploy the application**

   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```

7. **Access your vault**

   Open your browser and navigate to your configured Cloudflare domain (e.g., `https://vault.yourdomain.com`).

## Local Development

### API

```bash
cd api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
# Open directly in browser (no build step needed)
open index.html
# Or serve with Python
python -m http.server 3000
```

The frontend will be available at `http://localhost:3000`.

## Project Structure

```
md-vault/
├── api/                        # FastAPI backend
│   ├── Dockerfile
│   ├── main.py                 # Application entry point
│   ├── requirements.txt
│   └── ...
├── frontend/                   # Vanilla JS frontend
│   ├── Dockerfile
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── nginx.conf
├── k8s/                        # Kubernetes manifests
│   ├── namespace.yaml
│   ├── secrets.yaml.example
│   ├── configmap.yaml
│   ├── pv-pvc.yaml
│   ├── api-deployment.yaml
│   ├── api-service.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   ├── cloudflared-deployment.yaml
│   ├── ingress.yaml
│   └── backup-cronjob.yaml
├── terraform/                  # Infrastructure as Code
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── terraform.tfvars.example
├── scripts/                    # Utility scripts
│   ├── deploy.sh               # Full deploy pipeline
│   └── backup.py               # SQLite backup to R2
├── .gitignore
└── README.md
```

## API Endpoints

| Method   | Endpoint              | Description                          |
|----------|-----------------------|--------------------------------------|
| `GET`    | `/api/notes`          | List all notes (with pagination)     |
| `POST`   | `/api/notes`          | Create a new note                    |
| `GET`    | `/api/notes/{id}`     | Get a single note by ID              |
| `PUT`    | `/api/notes/{id}`     | Update an existing note              |
| `DELETE` | `/api/notes/{id}`     | Delete a note                        |
| `GET`    | `/api/search?q=`      | Full-text search across all notes    |
| `GET`    | `/api/health`         | Health check endpoint                |

## Screenshots

*Screenshots coming soon.*

## Backup Strategy

Backups are managed by `scripts/backup.py` and run automatically via a Kubernetes CronJob:

- **Local backup** using the SQLite online backup API (safe, no locking)
- **Remote backup** uploaded to Cloudflare R2 (S3-compatible storage)
- **Retention** keeps the latest 7 local backups and removes older ones

To run a manual backup:

```bash
kubectl exec -it deployment/md-vault-api -n md-vault -- python /app/backup.py
```

## License

MIT License

Copyright (c) 2025 MD Vault Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
