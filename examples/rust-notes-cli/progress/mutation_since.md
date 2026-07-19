# Mutación — feature `since` (rust-notes-cli)

**Veredicto:** PASS
**Score:** killed/total = 100% (umbral: 100%)

Ejecutado con el mutador propio `tools/mutate.rs` (sin dependencias; enmascara
cadenas, comentarios, literales de carácter y los módulos `#[cfg(test)]`, filtra
los mutantes que no compilan con `cargo test --lib --no-run` y evalúa con
`cargo test --lib`):

- `cargo build --quiet --bin mutate && ./target/debug/mutate src/cli.rs`     → 59/59 mutantes muertos.
- `... ./target/debug/mutate src/json.rs`    → 15/15 mutantes muertos.
- `... ./target/debug/mutate src/notes.rs`   → 3/3 mutantes muertos.
- `... ./target/debug/mutate src/storage.rs` → 1/1 mutantes muertos.

Total: **78 mutantes, 0 sobrevivientes.**

## Nota: este ejemplo no necesitó `// mutate: skip`

En el ejemplo Go, el comparador `byCreatedAtDesc` se escribía con `>` explícito,
lo que producía un mutante **equivalente** (`>` vs `>=` ordenan igual sobre
claves distintas) que había que marcar con el pragma. Aquí el orden se hace con
`slice::sort_by` y `Ord::cmp`, que **no tiene ningún operador de comparación que
mutar**: no aparece ningún mutante equivalente, así que no hizo falta el pragma.
El mutador lo soporta igualmente (ver `tools/mutate.rs` y `.harness/adapters/rust.md`).

## Casos que cerraron los agujeros
- Aserciones de **código de salida exacto** (`== 1`) en las rutas de error: sin
  ellas, mutar `return 1` sobrevive.
- **Tests de unidad de `valid_date`** (mes/día en los bordes 1, 12, 31 y fuera
  de rango 0, 13, 32): matan cada literal y comparación del validador.
- **Round-trip de `json`** con dígito único, UTF-8 y escapes, más los caminos de
  error (cadena sin cerrar, número ausente, clave equivocada, contenido
  sobrante): muerden el parser byte a byte, incluido el `bump` (`pos += 1`) y el
  `skip_ws` sobre los cuatro tipos de espacio.
- `save_fails_when_directory_does_not_exist` y `commands_fail_on_corrupt_store`:
  ejercitan las ramas de error de `load`/`save`.

PASS -> progress/mutation_since.md (score 100%)
