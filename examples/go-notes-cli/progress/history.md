# Historial de sesiones

## Sesión inicial — features 1-6 (storage, model, add/list, count, recent, since)
- storage_layer, note_model, cli_add_list, cli_count, cli_recent:
  implementados por TDD (Rojo→Verde→Refactor).
- since (sdd): spec → features/cli_since.feature (@s1..@s8) → aprobado → TDD →
  judge APPROVED → mutación 100%. Ver progress/{tdd,judge,mutation}_since.md.
- Verificación: `go test ./...` (verde) + mutación 100% en los 3 módulos
  (`src/cli.go` 52/52, `src/notes.go` 7/7, `src/storage.go` 7/7), con el
  mutador propio `tools/mutate.go`. Un mutante equivalente en el comparador de
  ordenación queda marcado con `// mutate: skip` (justificado). Resultado: done.
