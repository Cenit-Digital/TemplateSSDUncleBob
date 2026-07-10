#!/usr/bin/env pwsh
# init.ps1 — Verificación e inicialización del arnés SSD Uncle Bob (Windows/PowerShell).
# Equivalente a init.sh; delega en el motor agnóstico (Node).
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[FAIL] node no está instalado (requerido por el arnés)'
  exit 1
}
$engine = Join-Path $PSScriptRoot '.harness' 'harness.mjs'
& node $engine init
exit $LASTEXITCODE
