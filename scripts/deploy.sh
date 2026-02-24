#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== MD Vault Deploy ==="

# Detect environment: k3d (local) or k3s (cloud)
if command -v k3d >/dev/null 2>&1 && k3d cluster list 2>/dev/null | grep -q "md-vault"; then
  ENV="k3d"
  echo "Environment: k3d (local)"
elif command -v k3s >/dev/null 2>&1; then
  ENV="k3s"
  echo "Environment: k3s (cloud)"
else
  echo "ERROR: Neither k3d cluster 'md-vault' nor k3s found."
  echo "  Local:  ./scripts/start.sh  (creates k3d cluster)"
  echo "  Cloud:  install K3s on the server"
  exit 1
fi

# Build Docker images
echo "[1/5] Building API image..."
docker build -t md-vault-api:latest "$ROOT_DIR/backend"

echo "[2/5] Building Frontend image..."
docker build -t md-vault-frontend:latest "$ROOT_DIR/frontend"

# Import images
echo "[3/5] Importing images into $ENV..."
if [ "$ENV" = "k3d" ]; then
  k3d image import md-vault-api:latest md-vault-frontend:latest -c md-vault
else
  docker save md-vault-api:latest | sudo k3s ctr images import -
  docker save md-vault-frontend:latest | sudo k3s ctr images import -
fi

# Deploy with Helm
echo "[4/5] Deploying with Helm..."
if [ "$ENV" = "k3d" ]; then
  helm upgrade --install md-vault "$ROOT_DIR/helm/md-vault" \
    -f "$ROOT_DIR/helm/md-vault/values-local.yaml" \
    --namespace md-vault --create-namespace
else
  helm upgrade --install md-vault "$ROOT_DIR/helm/md-vault" \
    --namespace md-vault --create-namespace
fi

# Restart deployments to pick up new images
echo "[5/5] Restarting deployments..."
kubectl rollout restart deployment/md-vault-api -n md-vault
kubectl rollout restart deployment/md-vault-frontend -n md-vault

echo ""
echo "=== Deploy complete! ==="
echo "Checking pod status..."
kubectl get pods -n md-vault

if [ "$ENV" = "k3d" ]; then
  echo ""
  echo "Access locally: http://localhost"
  echo "Stop cluster:   ./scripts/stop.sh"
fi
