# TDD — feature `count` (node-notes-cli)

Ciclos Rojo-Verde-Refactor guiados por `features/count.feature`.

| Ciclo | @s   | Test (test/cli.test.mjs)                          | Cambio mínimo (src/cli.mjs) |
| ----- | ---- | ------------------------------------------------- | --------------------------- |
| 1     | @s1  | `count imprime 0 con almacén vacío`               | `cmdCount` imprime `${notes.length}` |
| 2     | @s2  | `count imprime el total exacto`                   | (ya cubierto por load real) |
| 3     | @s3  | `count no crea el almacén cuando no existe`       | `load` no escribe si falta el archivo |

## Trazabilidad
- @s1 (almacén vacío → 0) → `count imprime 0 con almacén vacío`
- @s2 (3 notas → 3)       → `count imprime el total exacto`
- @s3 (no crea el almacén) → `count no crea el almacén cuando no existe`

green -> progress/tdd_count.md
