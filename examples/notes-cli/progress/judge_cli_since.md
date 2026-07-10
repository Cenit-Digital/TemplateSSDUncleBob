# Review — feature #12 `cli_since`

**Veredicto:** APPROVED

## Cobertura de escenarios (@s ↔ test)  (todos en `tests/test_cli.py`)
- @s1 (límite inclusivo exacto, 23:00): [x] `test_since_includes_note_created_on_exact_date`
  (l. 278) — nota `2026-05-01T23:00:00` entra; muerde la inclusividad (`>=` vs `>`).
- @s2 (anterior fuera / posterior dentro): [x] `test_since_excludes_earlier_includes_later`
  (l. 284) — afirma `assertIn("nueva")` y `assertNotIn("vieja")`.
- @s3 (orden descendente): [x] `test_since_orders_matches_by_created_at_desc` (l. 292) —
  inserta 1,3,2 y exige titles `[dia-tres, dia-dos, dia-uno]`.
- @s4 (formato `<id>\t<created_at>\t<title>`): [x] `test_since_line_format_matches_list`
  (l. 303) — 3 campos por TAB + match exacto `2\t2026-05-04T08:00:00+00:00\tsegunda`.
- @s5 (formato inválido `2026/05/01`): [x] `test_since_invalid_date_format_is_error`
  (l. 317) — exit!=0, stdout vacío, "fecha" en stderr.
- @s6 (fecha imposible `2026-13-40`): [x] `test_since_impossible_calendar_date_is_error`
  (l. 324) — `strptime` la rechaza; exit!=0, stderr menciona fecha.
- @s7 (sin coincidencias): [x] `test_since_no_matches_outputs_nothing` (l. 331) —
  out vacío, exit 0 (no falla como `search`).
- @s8 (almacén vacío/inexistente): [x] `test_since_empty_store_outputs_nothing` (l. 338) —
  sin archivo, out vacío, exit 0.
- @s9 (no muta): [x] `test_since_does_not_mutate_store` (l. 345) — compara bytes antes/después.

## Disciplina TDD
- ¿Producción sin test que la pida? NO. `cmd_since` (src/cli.py:94-104), el subparser
  `since` (l. 147-149), y las constantes `DATE_LENGTH`/`DATE_FORMAT` (l. 11-12) están todas
  exigidas por escenarios concretos. `import datetime` lo pide @s5/@s6 (validación strptime).
- ¿Evidencia de Rojo→Verde→Refactor? SÍ. La bitácora `progress/tdd_cli_since.md` documenta
  9 ciclos, un test a la vez, con cheats deliberados (ciclo 1 lista todo → ciclo 2 fuerza
  el filtro) y los "lock tests" (@s4/@s6/@s7/@s8/@s9) explican por qué muerden aunque pasen
  a la primera. Coherente con `docs/tdd.md`.

## Calidad
- `cmd_since` es corto (11 líneas), un solo motivo de cambio; nombres reveladores.
- Sin números/literales mágicos: `DATE_LENGTH = len("YYYY-MM-DD")`, `DATE_FORMAT = "%Y-%m-%d"`.
- Contrato de errores correcto: valida la fecha ANTES de `storage.load()` y de imprimir
  (src/cli.py:95-98), lanza `NoteError` → `main` (l. 162-164) escribe a `sys.stderr` y
  retorna 1. Por eso @s5/@s6 ven stdout vacío incluso con notas presentes.
- Comparación por fecha de calendario inclusiva como la spec: `n["created_at"][:DATE_LENGTH]
  >= args.date` (l. 100). Verificado contra `project-spec.md` §`since` (límite inclusivo `>=`).
- Estilo coherente con `recent`/`list`: mismo `f"{n['id']}\t{n['created_at']}\t{n['title']}"`
  y `sorted(..., key=created_at, reverse=True)`. No se extrajo helper compartido (decisión
  documentada de no inflar alcance fuera de la feature).
- Arquitectura respetada: solo toca `cli.py`, usa `storage.load()`, nunca `storage.save()`
  (de ahí @s9). Sin dependencias externas (no hay `requirements.txt`). Sin `print()` de
  debug ni TODOs.

## Checkpoints
- C1 (arnés completo, `./init.sh` exit 0): [x] — 43 tests, "Entorno listo".
- C2 (estado coherente, una sola en in_progress): [x] — #12 única en `in_progress`.
- C3 (arquitectura, sin prints debug ni deps): [x]
- C4 (verificación real, tempdir, suite verde): [x] — usa `TemporaryDirectory`, 43 OK.
- C5 (sesión): [x] — N/A para el judge (no cierra sesión).
- C6 (contrato Gherkin, @s↔test, sin código no pedido): [x]
- C7 (mutación): [ ] — pendiente; lo valida `mutation_tester` tras esta aprobación.

## Cambios requeridos
Ninguno. La cobertura de los 9 escenarios es real y afirma lo que cada uno dice; la
disciplina TDD está documentada; la suite está verde. Pasa a prueba de mutación.
