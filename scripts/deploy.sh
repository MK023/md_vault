#!/bin/bash
set -euo pipefail

echo "=== MD Vault Deploy ==="

# Build Docker images
echo "[1/5] Building API image..."
docker build -t md-vault-api:latest ./api

echo "[2/5] Building Frontend image..."
docker build -t md-vault-frontend:latest ./frontend

# Import images into K3s
echo "[3/5] Importing images into K3s..."
docker save md-vault-api:latest | sudo k3s ctr images import -
docker save md-vault-frontend:latest | sudo k3s ctr images import -

# Apply K8s manifests
echo "[4/5] Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/pv-pvc.yaml
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml
kubectl apply -f k8s/cloudflared-deployment.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/backup-cronjob.yaml

# Restart deployments to pick up new images
echo "[5/5] Restarting deployments..."
kubectl rollout restart deployment/md-vault-api -n md-vault
kubectl rollout restart deployment/md-vault-frontend -n md-vault

echo ""
echo "=== Deploy complete! ==="
echo "Checking pod status..."
kubectl get pods -n md-vault
