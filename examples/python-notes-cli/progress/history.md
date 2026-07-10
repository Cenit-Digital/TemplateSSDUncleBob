# Bitácora histórica (append-only)

> Cada vez que se cierra una sesión, su resumen se añade aquí.
> No edites entradas anteriores. Solo añades al final.

---

## 2026-04-20 — Bootstrap del proyecto
- **Agente:** humano (Martín)
- **Cambios:** estructura inicial del arnés (AGENTS.md, init.sh, feature_list.json, docs/).
- **Resultado:** entorno listo. `./init.sh` verde.

## 2026-04-22 — Feature 1: storage_layer
- **Agente:** implementador #1
- **Plan:** crear `src/storage.py` con `load()` / `save()` atómicos y tests.
- **Cambios:** `src/storage.py`, `tests/test_storage.py`.
- **Verificación:** `./init.sh` verde, 3 tests pasan.
- **Cierre:** feature 1 marcada `done`.

## 2026-04-23 — Feature 2: note_model
- **Agente:** implementador #2
- **Plan:** dataclass `Note` con `Note.new(title, body)` y serialización dict.
- **Cambios:** `src/notes.py`, `tests/test_notes.py`.
- **Verificación:** `./init.sh` verde.
- **Cierre:** feature 2 marcada `done`.

## 2026-04-25 — Feature 3: cli_add_list
- **Agente:** implementador #3, revisado por reviewer-agent.
- **Plan:** `src/cli.py` con argparse, comandos `add` y `list`.
- **Cambios:** `src/cli.py`, `tests/test_cli.py`.
- **Verificación:** `./init.sh` verde, 7 tests pasan.
- **Cierre:** feature 3 marcada `done`. Próximo: feature 4 (show/delete).

## 2026-04-27 — Feature 4: cli_show_delete
- **Agente:** Claude Opus 4.7
- **Plan:** añadir `cmd_show` y `cmd_delete` en `src/cli.py` con manejo de `NoteNotFound` (stderr + exit 1).
- **Cambios:** `src/cli.py` (subcomandos `show`/`delete` y captura de `NoteError` en `main`), `tests/test_cli.py` (4 tests nuevos: éxito y fallo de cada comando, captura de stderr).
- **Verificación:** `./init.sh` verde, 14 tests pasan.
- **Cierre:** feature 4 marcada `done`. Próximo: feature 5 (search).

## 2026-04-27 — Feature 5: cli_search
- **Agente:** Claude Opus 4.6
- **Plan:** añadir `cmd_search` en `src/cli.py` con búsqueda case-insensitive en título y body. Sin coincidencias → NoteNotFound (stderr + exit 1).
- **Cambios:** `src/cli.py` (subcomando `search` con `cmd_search`), `tests/test_cli.py` (3 tests nuevos: coincidencia, no-coincidencia, case-insensitivity).
- **Verificación:** `./init.sh` verde, 17 tests pasan.
- **Cierre:** feature 5 marcada `done`. Todas las features completadas.

## 2026-04-29 — Feature 6: cli_edit
- **Agente:** Claude Opus 4.7 (leader) → implementer → reviewer.
- **Plan:** añadir `cmd_edit` en `src/cli.py` con `--title` y `--body` opcionales; sin flags → `NoteError`; id inexistente → `NoteNotFound`.
- **Cambios:** `src/cli.py` (subcomando `edit` y `cmd_edit` que construye una nueva instancia `Note` preservando `id`/`created_at`), `tests/test_cli.py` (5 tests: cada flag, ambos juntos, id inexistente, ausencia de flags).
- **Verificación:** `./init.sh` verde, 22 tests pasan. Reviewer APPROVED (`progress/review_cli_edit.md`).
- **Cierre:** feature 6 marcada `done`. Todas las features del proyecto completadas.

## 2026-05-13 — Feature 7: cli_recent
- **Agente:** Claude Opus 4.7 (leader) → spec_author → implementer → reviewer.
- **Plan:** ejecutar las 8 tasks de `specs/cli_recent/tasks.md`: añadir `cmd_recent` y subparser `recent` en `src/cli.py`, cubrir R1–R7 con tests, validar trazabilidad y `./init.sh`.
- **Cambios:** `src/cli.py` (`cmd_recent` + subparser con `--limit`), `tests/test_cli.py` (5 tests nuevos: orden por defecto, límite custom, archivo vacío, límite 0, límite negativo; helper `_add_with_created_at`).
- **Verificación:** `./init.sh` verde, 27 tests pasan. Reviewer APPROVED (`progress/review_cli_recent.md`); trazabilidad en `progress/impl_cli_recent.md`.
- **Cierre:** feature 7 marcada `done`. Próximo: feature 8 (cli_count).

## 2026-06-02 — Feature 8: cli_count
- **Agente:** Claude Opus 4.8 (tdd_craftsman), rama `uncle-bob-harness`.
- **Recorrido:** Gherkin (`features/cli_count.feature`, @s1..@s7) → TDD estricto Rojo-Verde-Refactor (7 ciclos, un test a la vez; solo los ciclos 1 y 3 introdujeron producción) → judge **APPROVED** (`progress/judge_cli_count.md`) → mutación **100%** sobre líneas de la feature (`progress/mutation_cli_count.md`, 2/2 mutantes muertos).
- **Cambios:** `src/cli.py` (`cmd_count` + subparser `count`), `tests/test_cli.py` (7 tests, uno por escenario), `features/cli_count.feature` (contrato @s1..@s7).
- **Trazabilidad @s → test:**
  - @s1 (almacén vacío → "0")              → `test_count_empty_store_prints_zero`
  - @s2 (almacén inexistente → "0")        → `test_count_missing_store_prints_zero`
  - @s3 (una nota → "1")                   → `test_count_single_note_prints_one`
  - @s4 (tres notas → "3" exacto)          → `test_count_three_notes_prints_three`
  - @s5 (entero pelado, sin "Total")       → `test_count_output_is_bare_integer_without_text`
  - @s6 (no muta el archivo, byte a byte)  → `test_count_does_not_mutate_store`
  - @s7 (idempotente, archivo sigue ausente) → `test_count_does_not_create_store_when_missing`
- **Verificación:** `./init.sh` verde, 34 tests pasan.
- **Cierre:** feature 8 marcada `done`. Próximo: feature 9 (cli_export).

## 2026-06-02 — Feature 12: cli_since
- **Agente:** Claude Opus 4.8 (craftsman_lead), rama `uncle-bob-harness`. Orquestó el pipeline completo: spec_partner → gherkin_author → ⏸ aprobación humana → tdd_craftsman → judge → mutation_tester.
- **Conversación de spec:** debatidas y cerradas con el humano 2 decisiones — (1) validar fecha real con `strptime("%Y-%m-%d")` (rechaza formato inválido Y fecha imposible como `2026-13-40`); (2) comparación por fecha de calendario (primeros 10 chars de `created_at`), límite inclusivo `>=`. Registradas en `project-spec.md` (sección `since`).
- **Recorrido:** Gherkin (`features/cli_since.feature`, @s1..@s9) → TDD estricto Rojo-Verde-Refactor (9 ciclos, un test a la vez; producción introducida en ciclos 1, 2, 3 y 5) → judge **APPROVED** (`progress/judge_cli_since.md`) → mutación **100%** sobre líneas de la feature (`progress/mutation_cli_since.md`; los 4 mutantes sobrevivientes del archivo están fuera de alcance, en `cmd_recent`/`build_parser`/`main`).
- **Cambios:** `src/cli.py` (`cmd_since` + subparser `since`, constantes `DATE_LENGTH`/`DATE_FORMAT`, import `datetime`), `tests/test_cli.py` (9 tests nuevos), `features/cli_since.feature` (contrato @s1..@s9), `project-spec.md`.
- **Trazabilidad @s → test:**
  - @s1 (límite inclusivo exacto)       → `test_since_includes_note_created_on_exact_date`
  - @s2 (anteriores fuera, posteriores) → `test_since_excludes_earlier_includes_later`
  - @s3 (orden descendente)             → `test_since_orders_matches_by_created_at_desc`
  - @s4 (formato de línea = list)       → `test_since_line_format_matches_list`
  - @s5 (fecha con formato inválido)    → `test_since_invalid_date_format_is_error`
  - @s6 (fecha imposible de calendario) → `test_since_impossible_calendar_date_is_error`
  - @s7 (sin coincidencias → vacío)     → `test_since_no_matches_outputs_nothing`
  - @s8 (almacén vacío → vacío)         → `test_since_empty_store_outputs_nothing`
  - @s9 (no modifica el almacén)        → `test_since_does_not_mutate_store`
- **Verificación:** `./init.sh` verde, 43 tests pasan.
- **Cierre:** feature 12 marcada `done`. Próximo: feature 9 (cli_export).
