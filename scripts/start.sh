#!/bin/bash
set -euo pipefail

CLUSTER_NAME="md-vault"
DATA_DIR="${MD_VAULT_DATA:-$HOME/.md-vault/data}"

echo "=== MD Vault Start ==="

# Check Docker is running
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is not running. Start Docker Desktop first."
  exit 1
fi

# Check k3d is installed
if ! command -v k3d >/dev/null 2>&1; then
  echo "ERROR: k3d is not installed. Run: brew install k3d"
  exit 1
fi

# Create data directory if needed
mkdir -p "$DATA_DIR"

# Check if cluster exists
if k3d cluster list 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "Cluster '$CLUSTER_NAME' found, starting..."
  k3d cluster start "$CLUSTER_NAME"
else
  echo "Creating cluster '$CLUSTER_NAME'..."
  k3d cluster create "$CLUSTER_NAME" \
    --port "80:80@loadbalancer" \
    --port "443:443@loadbalancer" \
    --volume "$DATA_DIR:/opt/md-vault/data" \
    --agents 0 \
    --wait
fi

# Wait for node to be ready
echo "Waiting for node to be ready..."
kubectl wait --for=condition=Ready node --all --timeout=60s

# Restore deployments scaled down by stop.sh
if kubectl get namespace md-vault >/dev/null 2>&1; then
  echo "Restoring deployments..."
  kubectl scale deployment --all -n md-vault --replicas=1 --timeout=30s 2>/dev/null || true
fi

# Install Nginx Ingress Controller if not present
if ! kubectl get namespace ingress-nginx >/dev/null 2>&1; then
  echo "Installing Nginx Ingress Controller..."
  kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/cloud/deploy.yaml
  echo "Waiting for ingress controller to be ready..."
  kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s
fi

echo ""
echo "=== Cluster ready! ==="
echo "Data directory: $DATA_DIR"
echo ""
echo "Next steps:"
echo "  ./scripts/deploy.sh    # Build and deploy the app"
echo "  ./scripts/stop.sh      # Graceful shutdown"
echo "  kubectl get pods -n md-vault"
