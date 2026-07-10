#!/usr/bin/env bash
# init.sh — Verificación e inicialización del entorno del arnés SSD Uncle Bob.
# El agente lo ejecuta al comenzar una sesión y antes de declarar nada `done`.
# Si falla, la sesión no debe avanzar. Delega en el motor agnóstico (Node).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "[FAIL] node no está instalado (requerido por el arnés)"; exit 1; }
exec node "$SCRIPT_DIR/.harness/harness.mjs" init
