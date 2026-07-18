# TDD — feature `since` (go-notes-cli)

Ciclos Rojo-Verde-Refactor guiados por `features/cli_since.feature`.

| Ciclo | @s      | Test (src/cli_test.go)              | Cambio mínimo (src/cli.go) |
| ----- | ------- | ----------------------------------- | -------------------------- |
| 1     | @s8     | `TestSinceEmptyStore`               | `cmdSince` valida fecha y no imprime nada |
| 2     | @s1/@s2 | `TestSinceInclusiveBoundary`        | filtra `created_at[:len(date)] >= date` |
| 3     | @s3     | `TestSinceDescendingOrder`          | ordena con `byCreatedAtDesc` |
| 4     | @s5     | `TestSinceInvalidFormat`            | `time.Parse` + error a stderr, código 1 |
| 5     | @s6     | `TestSinceImpossibleDate`           | (cubierto: `time.Parse` es estricto) |
| 6     | @s7     | `TestSinceNoMatches`                | (cubierto por el filtro) |
| 7     | (extra) | `TestSinceRequiresDate`             | guarda `len(rest) == 0` |

## Trazabilidad
- @s1 (límite inclusivo)      → `TestSinceInclusiveBoundary`
- @s2 (antes fuera / después dentro) → `TestSinceInclusiveBoundary`
- @s3 (orden descendente)     → `TestSinceDescendingOrder`
- @s4 (formato de línea)      → `TestSinceInclusiveBoundary` / `TestListFormat`
- @s5 (formato inválido)      → `TestSinceInvalidFormat`
- @s6 (fecha imposible)       → `TestSinceImpossibleDate`
- @s7 (sin coincidencias)     → `TestSinceNoMatches`
- @s8 (almacén vacío)         → `TestSinceEmptyStore`

green -> progress/tdd_since.md
