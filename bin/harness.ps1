#!/usr/bin/env pwsh
# harness.ps1 — Lanzador del motor agnóstico del arnés SSD Uncle Bob (Windows/PowerShell).
#   bin\harness.ps1 <init|test|mutate|verify|status|help> [args]
$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[FAIL] node no está instalado (requerido por el arnés)'
  exit 1
}
$engine = Join-Path $PSScriptRoot '..' '.harness' 'harness.mjs'
& node $engine @args
exit $LASTEXITCODE
