# TDD — feature `since` (rust-notes-cli)

Implementada por TDD estricto (Rojo → Verde → Refactor), un test a la vez,
guiada por `features/cli_since.feature` aprobado.

## Ciclos (resumen)

1. **Requiere fecha.** `since` sin argumento → stderr "requiere una fecha" y
   código 1. (Rojo → Verde.)
2. **Formato inválido.** `2026/05/01` → `valid_date` falso → código 1. Nace
   `valid_date` con la comprobación de longitud y separadores.
3. **Rango imposible.** `2026-13-40` → mes/día fuera de rango → código 1. Se
   añaden los límites `mes 1..=12`, `día 1..=31`.
4. **Límite inclusivo (@s1).** Nota del `2026-05-01T23:00:00Z` con
   `since 2026-05-01` → aparece. Nace la comparación por prefijo de fecha con
   `>=` (inclusiva).
5. **Anteriores fuera / posteriores dentro (@s2).** Filtro por `created_at`.
6. **Orden descendente (@s3).** Reutiliza `sort_desc` (comparador `Ord::cmp`).
7. **Formato de línea (@s4).** Reutiliza `print_lines`: mismo contrato que
   `list`/`recent`.
8. **Sin coincidencias / almacén vacío (@s7, @s8).** Código 0 y sin salida.

## Estado final

`cargo test` verde. La lógica de `since` queda en `src/cli.rs`
(`cmd_since` + `valid_date` + `note_date`), apoyada en `load` (storage) y
`sort_desc`/`print_lines` compartidos. Tests colocados en el módulo
`#[cfg(test)]` de `cli.rs`, más tests de unidad de `valid_date` para acorralar
cada rama del validador.
