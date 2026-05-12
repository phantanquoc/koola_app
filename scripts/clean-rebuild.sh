#!/usr/bin/env bash
# Clean rebuild script — reproducible build state for APP_KOOLA
# Usage:
#   bash scripts/clean-rebuild.sh              # full clean rebuild (backend + mobile)
#   bash scripts/clean-rebuild.sh --backend    # only backend
#   bash scripts/clean-rebuild.sh --mobile     # only mobile
#   bash scripts/clean-rebuild.sh --app-data   # also clear app AsyncStorage on device

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND=false
MOBILE=false
APP_DATA=false

if [ $# -eq 0 ]; then
  BACKEND=true
  MOBILE=true
else
  for arg in "$@"; do
    case "$arg" in
      --backend) BACKEND=true ;;
      --mobile) MOBILE=true ;;
      --app-data) APP_DATA=true ;;
      --all) BACKEND=true; MOBILE=true; APP_DATA=true ;;
      *) echo "Unknown arg: $arg" >&2; exit 1 ;;
    esac
  done
fi

log() { echo "[clean-rebuild] $*"; }

if $BACKEND; then
  log "Rebuilding backend Docker image..."
  cd "$ROOT/infra-local"
  docker compose build backend
  log "Recreating backend container..."
  docker compose up -d --force-recreate backend
  cd "$ROOT"
  log "Backend done."
fi

if $APP_DATA; then
  log "Clearing app AsyncStorage on device (requires adb)..."
  if command -v adb >/dev/null 2>&1; then
    adb shell pm clear com.chatapp || log "adb clear failed (app not installed?)"
  else
    log "adb not found — skip"
  fi
fi

if $MOBILE; then
  log "Cleaning Android Gradle + CMake cache..."
  cd "$ROOT/ChatApp/android"
  ./gradlew clean || log "gradlew clean failed — continuing"
  rm -rf .gradle app/.cxx app/build build 2>/dev/null || true
  cd "$ROOT"

  log "Clearing Metro cache..."
  cd "$ROOT/ChatApp"
  rm -rf "$TMPDIR/metro-"* "$TMPDIR/haste-map-"* 2>/dev/null || true

  log "Mobile clean done."
  log ""
  log "Next manual steps:"
  log "  1. Start Metro:  cd ChatApp && npx react-native start --reset-cache"
  log "  2. In another terminal:  cd ChatApp && npx react-native run-android"
  log ""
  log "For physical device over USB, ensure:"
  log "  adb reverse tcp:3000 tcp:3000"
  log "  adb reverse tcp:8081 tcp:8081"
fi

log "All selected tasks complete."
