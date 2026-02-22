.PHONY: help test lint fmt build build-api build-frontend build-backup \
       start stop deploy status logs clean

SHELL := /bin/bash
ROOT  := $(shell pwd)

# ── Help ─────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Development ──────────────────────────────────────────────────
test: ## Run pytest test suite
	python -m pytest backend/tests/ -v

test-ci: ## Run tests matching CI (strict)
	python -m pytest backend/tests/ -v --tb=short -q

lint: ## Run all linters (black, isort, flake8, bandit, mypy)
	cd backend && \
	black --check . && \
	isort --check-only . && \
	flake8 . --max-line-length 99 && \
	bandit -r . -s B608 && \
	mypy . --ignore-missing-imports --no-strict-optional

fmt: ## Auto-format code (black + isort)
	cd backend && black . && isort .

# ── Docker ───────────────────────────────────────────────────────
build: build-api build-frontend build-backup ## Build all Docker images

build-api: ## Build API image
	docker build -t md-vault-api:latest ./backend

build-frontend: ## Build Frontend image
	docker build -t md-vault-frontend:latest ./frontend

build-backup: ## Build Backup image
	docker build -t md-vault-backup:latest ./backup

# ── Cluster lifecycle ────────────────────────────────────────────
start: ## Start k3d cluster (creates on first run)
	./scripts/start.sh

stop: ## Graceful cluster shutdown
	./scripts/stop.sh

deploy: ## Build images + Helm deploy (auto-detects k3d/k3s)
	./scripts/deploy.sh

# ── Operations ───────────────────────────────────────────────────
status: ## Show pod status
	kubectl get pods -n md-vault

logs: ## Tail API logs
	kubectl logs -f deployment/md-vault-api -n md-vault

logs-frontend: ## Tail Frontend logs
	kubectl logs -f deployment/md-vault-frontend -n md-vault

helm-lint: ## Lint Helm chart
	helm lint helm/md-vault

helm-template: ## Render Helm templates (dry-run)
	helm template md-vault helm/md-vault -f helm/md-vault/values-local.yaml

# ── Compose (simple local dev) ───────────────────────────────────
up: ## Start with docker-compose
	docker-compose up --build -d

down: ## Stop docker-compose
	docker-compose down

# ── Cleanup ──────────────────────────────────────────────────────
clean: ## Remove Python cache and build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
