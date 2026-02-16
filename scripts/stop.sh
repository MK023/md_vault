#!/bin/bash
set -euo pipefail

CLUSTER_NAME="md-vault"

echo "=== MD Vault Stop ==="

# Check if cluster exists and is running
if ! k3d cluster list 2>/dev/null | grep -q "$CLUSTER_NAME"; then
  echo "Cluster '$CLUSTER_NAME' not found."
  exit 0
fi

# Graceful shutdown: scale down deployments first
echo "Scaling down deployments..."
kubectl scale deployment --all -n md-vault --replicas=0 --timeout=30s 2>/dev/null || true

# Wait for pods to terminate
echo "Waiting for pods to terminate..."
kubectl wait --for=delete pod --all -n md-vault --timeout=30s 2>/dev/null || true

# Stop the cluster (preserves state, zero resources)
echo "Stopping cluster..."
k3d cluster stop "$CLUSTER_NAME"

echo ""
echo "=== Cluster stopped ==="
echo "Data is preserved. Run './scripts/start.sh' to restart."
