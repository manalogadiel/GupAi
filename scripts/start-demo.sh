#!/usr/bin/env bash
# macOS/Linux twin of start-demo.ps1: readiness check, LAN pairing origin, then HTTPS on :8443.
# Usage: scripts/start-demo.sh [phone-lan-ip]
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
[ -x "$PY" ] || { echo "Project venv missing (.venv). See README setup." >&2; exit 1; }
curl -s -o /dev/null http://127.0.0.1:11434 || (ollama serve >/dev/null 2>&1 &)

READY=$("$PY" scripts/preflight.py ${1:+--phone-ip "$1"})
echo "$READY"
check() { "$PY" -c "import json,sys; print(json.loads(sys.argv[1])$1)" "$READY"; }
export GUPAI_PAIR_BASE_URL="$(check "['phone_origin'] or ''")"
[ "$(check "['checks']['https_certificate_valid']")" = True ] || { echo "HTTPS certificate missing or expired. See README (mkcert)." >&2; exit 1; }
[ "$(check "['checks']['phone_ip_in_certificate']")" = True ] || echo "WARNING: certificate does not cover ${GUPAI_PAIR_BASE_URL}. Regenerate it before pairing a phone." >&2

if lsof -iTCP:8443 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "GupAi is already running: https://localhost:8443 (restart it to load code changes)."; exit 0
fi
echo "Laptop: https://localhost:8443  ·  Phone joins through the chair QR (${GUPAI_PAIR_BASE_URL})."
exec "$PY" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile certs/gupai-key.pem --ssl-certfile certs/gupai.pem
