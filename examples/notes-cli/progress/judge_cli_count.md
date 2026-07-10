# Review — feature #8 `cli_count`

**Veredicto:** APPROVED

## Cobertura de escenarios (@s ↔ test)

- @s1 (almacén vacío → "0"): [x] cubierto por `test_count_empty_store_prints_zero`
  (`tests/test_cli.py:229`). Afirma `out == "0\n"` y `code == 0`.
- @s2 (almacén inexistente → "0"): [x] cubierto por `test_count_missing_store_prints_zero`
  (`tests/test_cli.py:235`). Verifica `not os.path.exists(self.path)` antes de
  ejecutar, luego `out == "0\n"` y `code == 0`.
- @s3 (una nota → "1"): [x] cubierto por `test_count_single_note_prints_one`
  (`tests/test_cli.py:241`). `out == "1\n"`, `code == 0`.
- @s4 (tres notas → "3" exacto): [x] cubierto por `test_count_three_notes_prints_three`
  (`tests/test_cli.py:247`). `out == "3\n"`, `code == 0`.
- @s5 (entero pelado, sin "Total"): [x] cubierto por
  `test_count_output_is_bare_integer_without_text` (`tests/test_cli.py:256`).
  `out.strip() == "2"` y `assertNotIn("Total", out)`.
- @s6 (no muta el archivo, byte a byte): [x] cubierto por
  `test_count_does_not_mutate_store` (`tests/test_cli.py:263`). Compara bytes
  del archivo antes/después con `assertEqual(before_bytes, f.read())`.
- @s7 (idempotente, archivo sigue ausente): [x] cubierto por
  `test_count_does_not_create_store_when_missing` (`tests/test_cli.py:272`).
  Verifica `not os.path.exists(self.path)` antes y después.

Los 7 escenarios tienen al menos un test concreto y verde. El mapa de la
bitácora (`progress/tdd_cli_count.md:70-76`) coincide con los tests reales.

## Disciplina TDD

- **¿Producción sin test que la pida?** NO. La producción total son 4 líneas
  efectivas: `cmd_count` (`src/cli.py:90-93`) y el subparser
  `p_count = sub.add_parser("count", ...)` + `set_defaults`
  (`src/cli.py:130-131` del diff). Ambas exigidas por @s1/@s3. La bitácora
  documenta que solo los ciclos 1 y 3 introdujeron producción
  (`progress/tdd_cli_count.md:60-66`); los demás tests son guardas que pasan
  por construcción, sin código "a futuro".
- **¿Evidencia de Rojo→Verde→Refactor?** SÍ. Bitácora con 7 ciclos
  (`progress/tdd_cli_count.md:8-58`). Ciclo 1: rojo real
  (`invalid choice: 'count'`) → `print(0)` (trampa de constante, Ley 3).
  Ciclo 3: rojo real (esperaba `"1\n"`, obtuvo `"0\n"`) → generalización a
  `print(len(storage.load()))`. Sin refactors en rojo (no había nada que
  refactorizar; función de 2 líneas).
- **¿Alcance inflado?** NO. No hay flags, formatos ni texto descriptivo que
  ningún escenario pida. `cmd_count` no llama a `storage.save` (consistente
  con @s6/@s7).

## Calidad

- `cmd_count` (`src/cli.py:90-93`): función corta (un solo motivo de cambio),
  nombre revelador, sin números mágicos, sin duplicación. Sigue el patrón de
  sus hermanos `cmd_edit`/`cmd_recent` (`storage.load()` sin argumento usa
  `DEFAULT_NOTES_PATH`, que es lo que los tests parchean — `storage.py:11-12`).
- Respeta `docs/architecture.md`: la capa `cli.py` delega en `storage.load()`,
  no toca dominio ni reescribe el archivo. Sin `print()` de debug ni TODOs.
- Contrato de errores: `count` no tiene rutas de error (operación de solo
  lectura sin argumentos), así que `return 0` siempre es correcto; no hay
  excepciones de dominio que capturar aquí. Consistente con `docs/conventions.md`.
- Estilo: comillas dobles, `from __future__ import annotations` ya presente en
  el módulo, líneas < 100. Sin objeciones.

## Checkpoints

- C1 (arnés completo): [x] — `./init.sh` exit 0, 34 tests verdes.
- C2 (estado coherente): [x] — `cli_count` es la única `in_progress`
  (`feature_list.json:124`); features `done` con tests que pasan.
- C3 (respeta arquitectura): [x] — solo se toca `cli.py`; sin deps externas;
  sin `print()` de debug ni TODOs.
- C4 (verificación real): [x] — tests con `tempfile.TemporaryDirectory`
  (`tests/test_cli.py:16`), sin mocks de fs; `unittest discover` muestra 34
  tests, todos verdes.
- C5 (sesión cerrada): [x] (parcial, no bloqueante para este review) —
  bitácora TDD presente; no se observan `*.tmp` ni `__pycache__` fuera de
  `.gitignore` en el árbol tocado. El cierre formal (history, marcar `done`)
  es posterior a judge + mutation_tester por diseño del workflow.
- C6 (contrato Gherkin): [x] — `features/cli_count.feature` con @s1..@s7,
  cada `Then` medible; mapa `@s → test` en `progress/tdd_cli_count.md`; sin
  producción no pedida por un test rojo.
- C7 (mutación): [ ] — fuera del alcance del judge; lo valida el
  `mutation_tester` tras esta aprobación.

## Cambios requeridos

Ninguno. El trabajo sobrevive: cobertura completa de @s1..@s7, disciplina TDD
sin alcance inflado, calidad de artesano y `./init.sh` verde.
