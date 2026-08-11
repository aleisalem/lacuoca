#!/usr/bin/env bash
# =============================================================================
#  LaCuoca – Development Environment Setup
#  Run once after cloning: bash scripts/setup_dev.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn] ${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── Prerequisites ─────────────────────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || error "Docker is not installed"
command -v docker-compose >/dev/null 2>&1 || \
  docker compose version >/dev/null 2>&1   || error "Docker Compose is not installed"

# Use 'docker compose' or 'docker-compose' whichever is available
DC="docker compose"
$DC version >/dev/null 2>&1 || DC="docker-compose"

# ── .env file ─────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "Creating .env from .env.example …"
  cp .env.example .env

  # Generate random secrets
  SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64)
  sed -i "s/change-me-to-a-random-64-char-string/$SECRET/" .env
  sed -i "s/change-me-too-another-random-64-char-string/$JWT_SECRET/" .env
  info ".env created with random secrets."
else
  warn ".env already exists — skipping."
fi

# ── Generate placeholder PWA icons ───────────────────────────────────────────
ICONS_DIR="frontend/public/icons"
mkdir -p "$ICONS_DIR"

if [ ! -f "$ICONS_DIR/icon-192.png" ]; then
  info "Generating placeholder PWA icons …"
  if command -v convert >/dev/null 2>&1; then
    # ImageMagick available
    convert -size 192x192 xc:'#f97316' \
      -fill white -pointsize 80 -gravity Center -annotate 0 "🍴" \
      "$ICONS_DIR/icon-192.png" 2>/dev/null || true
    convert -size 512x512 xc:'#f97316' \
      -fill white -pointsize 200 -gravity Center -annotate 0 "🍴" \
      "$ICONS_DIR/icon-512.png" 2>/dev/null || true
  else
    # Fallback: create minimal 1×1 orange PNG using Python
    python3 - <<'PYEOF'
import struct, zlib, base64, os

def make_png(size, color=(249, 115, 22)):
    width = height = size
    raw = bytes([0] + list(color) + [255]) * width
    idat = zlib.compress(raw * height)
    def chunk(t, d): crc = zlib.crc32(t+d) & 0xffffffff; return struct.pack('>I', len(d)) + t + d + struct.pack('>I', crc)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', idat) + chunk(b'IEND', b''))

os.makedirs('frontend/public/icons', exist_ok=True)
open('frontend/public/icons/icon-192.png', 'wb').write(make_png(192))
open('frontend/public/icons/icon-512.png', 'wb').write(make_png(512))
print("Icons created.")
PYEOF
  fi
  info "PWA icons created in $ICONS_DIR/"
else
  warn "PWA icons already exist — skipping."
fi

# ── Local Python venv (for IDE / editor support) ─────────────────────────────
VENV_DIR="backend/.venv"
if [ ! -d "$VENV_DIR" ]; then
  info "Creating local Python venv at backend/.venv …"
  python3 -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install --upgrade pip --quiet
  "$VENV_DIR/bin/pip" install -r backend/requirements.txt --quiet
  info "Venv ready. To activate: source backend/.venv/bin/activate"
else
  warn "backend/.venv already exists — updating packages …"
  "$VENV_DIR/bin/pip" install --upgrade pip --quiet
  "$VENV_DIR/bin/pip" install -r backend/requirements.txt --quiet
fi

# ── Build & start containers ──────────────────────────────────────────────────
info "Pulling / building Docker images (this may take a few minutes on first run) …"
$DC build --parallel

info "Starting services …"
$DC up -d

# ── Wait for backend ──────────────────────────────────────────────────────────
info "Waiting for backend to become healthy …"
MAX=60; COUNT=0
until curl -sf http://localhost:8000/health >/dev/null 2>&1; do
  COUNT=$((COUNT+1))
  [ $COUNT -ge $MAX ] && error "Backend did not start in time. Check: $DC logs backend"
  echo -n "."
  sleep 2
done
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  LaCuoca is running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  📱 App (frontend):   ${YELLOW}http://localhost:5173${NC}"
echo -e "  🔧 API (backend):    ${YELLOW}http://localhost:8000${NC}"
echo -e "  📖 API docs:         ${YELLOW}http://localhost:8000/api/docs${NC}"
echo ""

# Print local network IPs for phone access
LOCAL_IPS=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^192|^10\.' | head -3 || true)
if [ -n "$LOCAL_IPS" ]; then
  echo -e "  📡 On your local network (for phones):"
  while IFS= read -r ip; do
    echo -e "     ${YELLOW}http://${ip}:5173${NC}"
  done <<< "$LOCAL_IPS"
  echo ""
fi

# Read admin credentials from .env
ADMIN_USER=$(grep '^ADMIN_USERNAME' .env | cut -d= -f2 | tr -d ' ')
ADMIN_PASS=$(grep '^ADMIN_PASSWORD' .env | cut -d= -f2 | tr -d ' ')
echo -e "  🔑 Admin login:  ${YELLOW}${ADMIN_USER}${NC} / ${YELLOW}${ADMIN_PASS}${NC}"
echo ""
echo -e "  💡 Tip: set OLLAMA_BASE_URL in .env to point to your Ollama server, then change the admin password."
echo ""
