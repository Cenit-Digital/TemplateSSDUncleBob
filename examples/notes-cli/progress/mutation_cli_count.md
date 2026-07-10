# Mutación — feature #8 `cli_count`

**Veredicto:** PASS
**Score (líneas de la feature):** killed/total = 2/2 = 100% (umbral: 100%)
**Score (archivo completo, informativo):** killed/total = 30/34 = 88.2%

## Pre-condiciones verificadas

- Judge: APPROVED (`progress/judge_cli_count.md:2`).
- `./init.sh`: exit 0, 34 tests verdes.
- Archivo tocado por la feature: `src/cli.py`, función `cmd_count`
  (`src/cli.py:90-93`) y subparser `count` (`src/cli.py:130-131`), según
  `progress/tdd_cli_count.md`.

## Comando ejecutado

```bash
python3 tools/mutate.py src/cli.py
```

34 mutantes válidos (0 descartados por no compilar). Sin truncamiento, sin
`--max`: se midió el archivo completo.

## Mutantes sobre las LÍNEAS DE LA FEATURE (`cmd_count` + subparser `count`)

Todos MUERTOS. El umbral de 100% sobre líneas nuevas/tocadas se cumple.

- `src/cli.py:93` número (`'0' -> '1'`) → **muerto** [18/34].
  `print(len(notes))` mutado a `print(len(notes) + 1)`-equivalente lo matan
  `test_count_empty_store_prints_zero` (espera `"0\n"`),
  `test_count_single_note_prints_one` (`"1\n"`) y
  `test_count_three_notes_prints_three` (`"3\n"`).
- `src/cli.py:93` retorno (`'return 0' -> 'return None'`) → **muerto** [31/34].
  Lo distingue cualquier test que afirma `code == 0` (@s1..@s4).
- Subparser `count` (`src/cli.py:130-131`): no genera mutantes textuales del
  catálogo (no hay comparaciones, números ni retornos en esas dos líneas),
  pero su correcta existencia está cubierta: sin el subparser, los 7 tests de
  `count` fallarían con `invalid choice: 'count'` (rojo real del ciclo 1,
  `progress/tdd_cli_count.md:11-13`). Mutar `func=cmd_count` no está en el
  catálogo del mutador; queda fuera de alcance del umbral textual.

Total mutantes textuales en líneas de la feature: 2 — ambos muertos → 100%.

## Mutantes sobrevivientes en CÓDIGO HEREDADO (medidos, NO bloquean)

Ninguno cae en `cmd_count` ni en su subparser. Se reportan por higiene:

- `src/cli.py:60` número (`'0' -> '1'`) — función `cmd_recent`
  (`if args.limit <= 0` → `if args.limit <= 1`).
  Falta: un test que ejerza `recent --limit 1` y verifique que NO lanza
  `NoteError` (el límite 1 sigue siendo válido). Heredado, fuera de esta feature.
- `src/cli.py:64` número (`'0' -> '1'`) — función `cmd_recent`
  (`return 0` del caso "sin notas" → `return 1`).
  Falta: un test que afirme `code == 0` al pedir `recent` sobre un almacén
  vacío. Heredado.
- `src/cli.py:98` palabra (`'True' -> 'False'`) — función `build_parser`
  (`add_subparsers(..., required=True)` → `required=False`).
  Falta: un test que invoque la CLI sin subcomando y espere error (exit code
  no-cero). Infra compartida del parser, no añadida por esta feature. Heredado.
- `src/cli.py:143` retorno (`'return 1' -> 'return None'`) — función `main`
  (rama de captura de `NoteError`).
  Falta: un test que verifique que el código de salida ante un `NoteError`
  es exactamente `1` (hoy se afirma el stderr pero no el `code == 1` en la
  ruta de `main`). Heredado.

Ninguno de estos cuatro es un equivalente genuino: todos cambian comportamiento
observable (códigos de salida o validación de argumentos) y son matables con
tests adicionales. Pero pertenecen a `cmd_recent`, `build_parser` y `main`, no
a la feature `cli_count`, así que se miden y no bloquean (regla de
`docs/mutation-testing.md:55-57`).

## Conclusión

La feature `cli_count` (`cmd_count` + subparser `count`) tiene 100% de mutantes
muertos sobre sus líneas nuevas/tocadas. PASS. Los 4 sobrevivientes son
agujeros en código heredado, candidatos a futuro trabajo del `tdd_craftsman`,
fuera del alcance de esta feature.
