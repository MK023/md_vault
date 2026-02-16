#!/bin/bash
set -euo pipefail

# Log everything
exec > >(tee /var/log/startup.log) 2>&1
echo "=== MD Vault Bootstrap - $(date) ==="

# Update system
apt-get update -y
apt-get upgrade -y

# Install Docker
apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://get.docker.com | sh
usermod -aG docker mdvault

# Install K3s (disable traefik and servicelb - we use nginx ingress + cloudflare tunnel)
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC="--disable traefik --disable servicelb --write-kubeconfig-mode 644" sh -

# Wait for K3s to be ready
echo "Waiting for K3s..."
until kubectl get nodes 2>/dev/null | grep -q " Ready"; do
  sleep 5
done
echo "K3s is ready"

# Install Nginx Ingress Controller (baremetal - no cloud LB needed, tunnel handles ingress)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.9.4/deploy/static/provider/baremetal/deploy.yaml

# Patch nginx ingress to use hostNetwork so cloudflared can reach it on localhost:80
kubectl -n ingress-nginx patch deployment ingress-nginx-controller \
  --type='json' -p='[{"op":"add","path":"/spec/template/spec/hostNetwork","value":true}]' 2>/dev/null || true

# Set KUBECONFIG for mdvault user
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> /home/mdvault/.bashrc
mkdir -p /home/mdvault/.kube
cp /etc/rancher/k3s/k3s.yaml /home/mdvault/.kube/config
chown -R mdvault:mdvault /home/mdvault/.kube

# Create data directory for PV
mkdir -p /opt/md-vault/data
chown 1000:1000 /opt/md-vault/data

echo "=== Bootstrap complete - $(date) ==="
