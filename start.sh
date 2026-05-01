#!/usr/bin/env bash
# start.sh — Launch Wheel Advisor backend and frontend

set -euo pipefail

# Run each background job in its own process group so we can kill the entire
# tree (e.g. the node child spawned by `npm run dev`) with a single signal.
set -m

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOG_DIR="$SCRIPT_DIR/.logs"

# Load backend/.env so its values are visible to this script (shell env vars
# set before this block take precedence, matching dotenvy's behaviour).
if [[ -f "$BACKEND_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    # Skip comments and blank lines.
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    # Only set if not already exported in the environment.
    [[ -v "$key" ]] || export "$key"="$value"
  done < "$BACKEND_DIR/.env"
fi

BACKEND_PORT="${BIND_ADDR:+${BIND_ADDR##*:}}"
BACKEND_PORT="${BACKEND_PORT:-9000}"

mkdir -p "$LOG_DIR"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "Stopping services…"
  # Kill the entire process group for each child (handles npm → node chains).
  [[ -n "${BACKEND_PID:-}" ]]  && kill -- -"$BACKEND_PID"  2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill -- -"$FRONTEND_PID" 2>/dev/null || true
  [[ -n "${TAIL_PID:-}" ]]     && kill -- "$TAIL_PID"      2>/dev/null || true
  # Give processes up to 3 s to exit gracefully, then force-kill.
  sleep 1
  [[ -n "${BACKEND_PID:-}" ]]  && kill -0 "$BACKEND_PID"  2>/dev/null && kill -9 -- -"$BACKEND_PID"  2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null && kill -9 -- -"$FRONTEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Build backend (if binary is outdated) ────────────────────────────────────
echo "▶ Building backend…"
(cd "$BACKEND_DIR" && cargo build --release 2>&1) | sed 's/^/  [backend-build] /'

BACKEND_BIN="$BACKEND_DIR/target/release/wheel-advisor"

# ── Start backend ─────────────────────────────────────────────────────────────
echo "▶ Starting backend (port ${BACKEND_PORT})…"
BIND_ADDR="0.0.0.0:${BACKEND_PORT}" \
  "$BACKEND_BIN" > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

# Wait for backend to accept connections (up to 10 s)
echo -n "  Waiting for backend"
for i in $(seq 1 20); do
  if curl -sf "http://localhost:${BACKEND_PORT}/health" > /dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 0.5
done

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo ""
  echo "ERROR: backend failed to start. Logs:"
  cat "$LOG_DIR/backend.log"
  exit 1
fi

# ── Install frontend deps if needed ──────────────────────────────────────────
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "▶ Installing frontend dependencies…"
  (cd "$FRONTEND_DIR" && npm install 2>&1) | sed 's/^/  [npm] /'
fi

# ── Start frontend ────────────────────────────────────────────────────────────
echo "▶ Starting frontend…"
(cd "$FRONTEND_DIR" && NEXT_PUBLIC_API_URL="http://localhost:${BACKEND_PORT}" npm run dev 2>&1) \
  > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to be ready (up to 15 s)
FRONTEND_PORT=3000
echo -n "  Waiting for frontend"
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${FRONTEND_PORT}" > /dev/null 2>&1; then
    echo " ✓"
    break
  fi
  echo -n "."
  sleep 0.5
done

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo ""
  echo "ERROR: frontend failed to start. Logs:"
  cat "$LOG_DIR/frontend.log"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Wheel Advisor is running"
echo "  Frontend : http://localhost:${FRONTEND_PORT}"
echo "  Backend  : http://localhost:${BACKEND_PORT}"
echo "  Data     : Yahoo Finance"
echo "  Logs     : ${LOG_DIR}/"
echo "  Press Ctrl+C to stop"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Stream logs to stdout while both processes run
tail -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" &
TAIL_PID=$!

# Block until Ctrl+C (or one of the child processes exits unexpectedly).
wait "$BACKEND_PID" "$FRONTEND_PID" || true
