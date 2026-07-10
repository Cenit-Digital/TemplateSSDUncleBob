# Bitácora TDD — feature #12 `cli_since` (comando `since`)

Feature en curso: #12 — cli_since
Escenarios recorridos: @s1..@s9 (de `features/cli_since.feature`).

> Disciplina: un test rojo a la vez → mínima producción → refactor en verde.
> Patrón base: `cmd_recent` (mismo formato de línea y orden descendente).
> Estado final: `./init.sh` verde, 43 tests OK (34 base + 9 nuevos).
> Status feature: queda en `in_progress` (no marcado `done`: pendiente judge + mutación).

## Ciclos Rojo-Verde-Refactor

### Ciclo 1 — @s1 (límite inclusivo exacto)
- ROJO: `test_since_includes_note_created_on_exact_date` — nota a las 23:00 del
  día exacto debe entrar. Falla: subcomando `since` no existe (argparse SystemExit 2).
- VERDE: añado `cmd_since` (lista todas las notas, cheat deliberado) + subparser
  `since` con argumento posicional `date`.
- REFACTOR: nada (trivial).

### Ciclo 2 — @s2 (anteriores fuera, posteriores dentro)
- ROJO: `test_since_excludes_earlier_includes_later` — `2026-04-30` fuera,
  `2026-05-02` dentro. Falla: el cheat imprime ambas.
- VERDE: filtro por fecha de calendario `n["created_at"][:DATE_LENGTH] >= args.date`.
- REFACTOR: introduzco constante `DATE_LENGTH = len("YYYY-MM-DD")` (sin números mágicos).

### Ciclo 3 — @s3 (orden descendente)
- ROJO: `test_since_orders_matches_by_created_at_desc` — notas añadidas en
  orden 1,3,2; salida esperada 3,2,1. Falla: salía en orden de inserción.
- VERDE: `sorted(matches, key=created_at, reverse=True)` (igual que `cmd_recent`).
- REFACTOR: nada.

### Ciclo 4 — @s4 (formato `<id>\t<created_at>\t<title>`)
- ROJO/lock: `test_since_line_format_matches_list` — verifica 3 campos separados
  por TAB. Pasa a la primera (el formato venía correcto desde @s1). Verificado que
  muerde: un separador por espacios daría 1 campo y rompería el assert (`len==3`).
- VERDE/REFACTOR: sin cambios de producción (contrato ya cumplido).

### Ciclo 5 — @s5 (formato de fecha inválido `2026/05/01`)
- ROJO: `test_since_invalid_date_format_is_error` — exit != 0, stdout vacío,
  stderr menciona "fecha". Falla: salía exit 0 sin error.
- VERDE: valido con `datetime.strptime(args.date, DATE_FORMAT)`; en `ValueError`
  lanzo `NoteError` (capturada por `main` → stderr + exit 1). Constante `DATE_FORMAT`.
- REFACTOR: nada.

### Ciclo 6 — @s6 (fecha imposible `2026-13-40`)
- ROJO/lock: `test_since_impossible_calendar_date_is_error`. Pasa a la primera
  porque `strptime` ya rechaza fechas de calendario imposibles. Verificado que
  muerde la decisión: un regex `\d{4}-\d{2}-\d{2}` ACEPTARÍA `2026-13-40`; solo
  `strptime` lo rechaza. El test guarda esa decisión (formato vs validez de calendario).
- VERDE/REFACTOR: sin cambios (cubierto por la validación de @s5).

### Ciclo 7 — @s7 (sin coincidencias → vacío, exit 0)
- ROJO/lock: `test_since_no_matches_outputs_nothing` — solo una nota anterior.
  Pasa con el filtro actual. Distingue el contrato de `since` (vacío + exit 0)
  del de `search` (error en no-coincidencia): muerde si alguien hiciera `since`
  fallar como `search`.
- VERDE/REFACTOR: sin cambios.

### Ciclo 8 — @s8 (almacén vacío/inexistente → vacío, exit 0)
- ROJO/lock: `test_since_empty_store_outputs_nothing` — sin archivo de notas.
  Pasa porque `storage.load()` devuelve `[]` para archivo inexistente.
- VERDE/REFACTOR: sin cambios.

### Ciclo 9 — @s9 (no modifica el almacén)
- ROJO/lock: `test_since_does_not_mutate_store` — compara el archivo byte a byte
  antes/después. Pasa porque `cmd_since` nunca llama a `storage.save()`. Guarda
  contra regresiones (fallaría si alguien añadiera una escritura).

## REFACTOR final (en verde)
- `cmd_since` queda corto, con nombres reveladores y constantes (`DATE_LENGTH`,
  `DATE_FORMAT`) en vez de números/literales mágicos. Sin comentarios (innecesarios).
- Se evitó deliberadamente extraer un helper de impresión compartido con
  `list`/`search`/`recent`: ampliaría el alcance a código fuera de esta feature.

## Trazabilidad @s → test  (todos en `tests/test_cli.py`)
- @s1 (límite inclusivo exacto)        → `test_since_includes_note_created_on_exact_date`
- @s2 (anteriores fuera, posteriores)  → `test_since_excludes_earlier_includes_later`
- @s3 (orden descendente)              → `test_since_orders_matches_by_created_at_desc`
- @s4 (formato de línea = list)        → `test_since_line_format_matches_list`
- @s5 (fecha con formato inválido)     → `test_since_invalid_date_format_is_error`
- @s6 (fecha imposible de calendario)  → `test_since_impossible_calendar_date_is_error`
- @s7 (sin coincidencias → vacío)      → `test_since_no_matches_outputs_nothing`
- @s8 (almacén vacío → vacío)          → `test_since_empty_store_outputs_nothing`
- @s9 (no modifica el almacén)         → `test_since_does_not_mutate_store`

## Cierre — DONE (2026-06-02)
- judge: APROBADO (`progress/judge_cli_since.md`).
- mutación: PASA, score 100% sobre las líneas de la feature (`progress/mutation_cli_since.md`).
- `./init.sh` reverificado verde: 43 tests OK.
- Status feature #12 cambiado a `"done"` en `feature_list.json`.

## Archivos tocados
- `src/cli.py`: `cmd_since`, subparser `since`, constantes `DATE_LENGTH`/`DATE_FORMAT`,
  import `datetime`.
- `tests/test_cli.py`: 9 tests nuevos (reusan `_add_with_created_at`, `_run`).
