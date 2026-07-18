# Mutación — feature `since` (go-notes-cli)

**Veredicto:** PASS
**Score:** killed/total = 100% (umbral: 100%)

Ejecutado con el mutador propio `tools/mutate.go` (sobre `go/scanner`):

- `go run ./tools src/cli.go`     → 52/52 mutantes muertos.
- `go run ./tools src/notes.go`   → 7/7 mutantes muertos.
- `go run ./tools src/storage.go` → 7/7 mutantes muertos.

Sin mutantes sobrevivientes.

## Nota sobre el mutante equivalente

El comparador de `byCreatedAtDesc` (`src/cli.go`) lleva `// mutate: skip`: sobre
claves distintas, `>` y `>=` producen exactamente el mismo orden, así que mutar
ese operador es un mutante **equivalente** (indetectable por definición, no un
agujero en los tests). El mutador respeta el pragma y no lo cuenta, igual que el
mutador de Node. Todos los demás operadores, enteros y comprobaciones de error sí
se cuentan y quedan muertos.

## Casos que cerraron los últimos agujeros
- Aserciones de **código de salida exacto** (`== 1`) en las rutas de error: sin
  ellas, mutar `return 1` → `return 2` sobrevive (el test solo veía `!= 0`).
- `TestSaveReturnsErrorWhenTargetIsDirectory`: fuerza el fallo de `os.Rename`
  para matar la inversión de su comprobación de error.
- `TestCommandsFailOnCorruptStore` y `TestAddFailsWhenSaveCannotWrite`:
  ejercitan las ramas `if err != nil { return 1 }` de Load/Save.

PASS -> progress/mutation_since.md (score 100%)
