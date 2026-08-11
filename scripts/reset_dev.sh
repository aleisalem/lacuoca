#!/usr/bin/env bash
# =============================================================================
#  LaCuoca – Reset Development Environment
#  WARNING: This DELETES all data (database, uploads, caches).
#  Use to start fresh during development.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${RED}⚠️  WARNING: This will DELETE all app data (database, uploads).${NC}"
read -rp "Are you sure? Type YES to continue: " CONFIRM
[ "$CONFIRM" = "YES" ] || { echo "Aborted."; exit 0; }

DC="docker compose"
$DC version >/dev/null 2>&1 || DC="docker-compose"

echo -e "${YELLOW}[reset]${NC} Stopping all containers …"
$DC down --remove-orphans

echo -e "${YELLOW}[reset]${NC} Removing volumes …"
$DC down -v

echo -e "${YELLOW}[reset]${NC} Clearing upload files …"
rm -rf backend/uploads/*

echo -e "${YELLOW}[reset]${NC} Rebuilding and starting …"
$DC build --parallel
$DC up -d

echo -e "${YELLOW}[reset]${NC} Waiting for backend …"
MAX=60; COUNT=0
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do
  COUNT=$((COUNT+1))
  [ $COUNT -ge $MAX ] && { echo -e "${RED}Backend timeout${NC}"; exit 1; }
  echo -n "."; sleep 2
done
echo ""

echo -e "${GREEN}[reset]${NC} Done! Fresh environment is ready."
echo -e "  App:  ${YELLOW}http://localhost:5173${NC}"
echo -e "  API:  ${YELLOW}http://localhost:8000/api/docs${NC}"
