# TDD — feature #8 `cli_count`

Contrato: `features/cli_count.feature` (@s1..@s7).
Disciplina: Las Tres Leyes del TDD, un test a la vez, Rojo→Verde→Refactor.
Patrón de test imitado: `tests/test_cli.TestCli` (tempfile.TemporaryDirectory +
patch de `storage.DEFAULT_NOTES_PATH`, helper `_run` con redirect_stdout/stderr).

## Bitácora de ciclos

### Ciclo 1 — @s1 (almacén vacío → "0")
- **ROJO:** `test_count_empty_store_prints_zero`. Falla con
  `argparse.ArgumentError: invalid choice: 'count'` (no existe el subcomando).
- **VERDE (mínimo):** `cmd_count` con `print(0)` + subparser `count`. Trampa
  deliberada con constante (no hay aún test que la desmienta).
- **REFACTOR:** nada que limpiar; función de una línea.

### Ciclo 2 — @s2 (almacén inexistente → "0")
- **ROJO/test:** `test_count_missing_store_prints_zero` (afirma que el archivo
  NO existe antes de ejecutar). Pasa de inmediato porque la constante `0`
  cubre también este caso; comportamiento ya correcto. La generalización la
  forzará @s3.
- **VERDE:** sin cambio de producción.
- **REFACTOR:** nada.

### Ciclo 3 — @s3 (una nota → "1")
- **ROJO:** `test_count_single_note_prints_one`. Falla: la constante `0` ya no
  basta (esperaba `"1\n"`, obtuvo `"0\n"`).
- **VERDE (mínimo):** generalizar `cmd_count` a
  `notes = storage.load(); print(len(notes))`.
- **REFACTOR:** función ya corta y con nombres claros; nada que tocar.

### Ciclo 4 — @s4 (tres notas → "3", el número justo)
- **ROJO/test:** `test_count_three_notes_prints_three`. Pasa ya: la
  implementación se generalizó en el ciclo 3. El escenario es un caso distinto
  del contrato ("N exacto, no ≥1") y merece su propio test de guarda.
- **VERDE:** sin cambio.
- **REFACTOR:** nada.

### Ciclo 5 — @s5 (entero pelado, sin "Total")
- **ROJO/test:** `test_count_output_is_bare_integer_without_text`. Pasa por
  construcción (`print(len(...))` no emite texto). Guarda contra una regresión
  hacia `Total: N`.
- **VERDE:** sin cambio.
- **REFACTOR:** nada.

### Ciclo 6 — @s6 (no muta el archivo, byte a byte)
- **ROJO/test:** `test_count_does_not_mutate_store`. Pasa: `cmd_count` nunca
  llama a `storage.save`. Guarda real: una implementación que escribiese
  fallaría la comparación de bytes.
- **VERDE:** sin cambio.
- **REFACTOR:** nada.

### Ciclo 7 — @s7 (idempotente en almacén inexistente; sigue sin existir)
- **ROJO/test:** `test_count_does_not_create_store_when_missing`. Pasa:
  `storage.load` de un archivo ausente devuelve `[]` sin crearlo. Guarda
  contra una implementación que tocase el archivo.
- **VERDE:** sin cambio.
- **REFACTOR:** nada.

## Nota sobre las Tres Leyes

Solo dos ciclos (1 y 3) exigieron código de producción nuevo, y cada uno tras
un test rojo: `print(0)` (constante, Ley 3) y luego `print(len(storage.load()))`
(generalización forzada por @s3). Los ciclos 2, 4-7 añaden tests de guarda que
codifican aristas distintas del contrato; pasan por construcción y no
introducen producción "a futuro". No hubo refactors en rojo.

## Trazabilidad @s → test

- @s1 (almacén vacío → "0")              → `test_count_empty_store_prints_zero`
- @s2 (almacén inexistente → "0")        → `test_count_missing_store_prints_zero`
- @s3 (una nota → "1")                   → `test_count_single_note_prints_one`
- @s4 (tres notas → "3" exacto)          → `test_count_three_notes_prints_three`
- @s5 (entero pelado, sin "Total")       → `test_count_output_is_bare_integer_without_text`
- @s6 (no muta el archivo, byte a byte)  → `test_count_does_not_mutate_store`
- @s7 (idempotente, archivo sigue ausente) → `test_count_does_not_create_store_when_missing`

## Estado final

- `./init.sh` VERDE de punta a punta (34 tests, OK).
- Implementación: `cmd_count` + subparser `count` en `src/cli.py`.
- 7 tests nuevos en `tests/test_cli.py` (uno por escenario).
- Feature #8 sigue `in_progress`. NO marcada `done` (pendiente judge +
  mutation_tester).
