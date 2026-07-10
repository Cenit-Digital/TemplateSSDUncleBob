# Mutación — feature #12 `cli_since` (comando `since`)

**Veredicto:** PASS
**Score (líneas de la feature):** killed/total = 100% (umbral: 100% sobre líneas nuevas/tocadas)
**Score (archivo completo `src/cli.py`):** 34/38 = 89.5% (informativo; incluye código heredado fuera de alcance)

## Comando ejecutado
```bash
python3 tools/mutate.py src/cli.py --max 200
```

## Alcance de la feature (`progress/tdd_cli_since.md` → "Archivos tocados")
Líneas nuevas/tocadas por `cli_since` en `src/cli.py`:
- 11-12 → constantes `DATE_LENGTH`, `DATE_FORMAT`
- 94-104 → `cmd_since` (validación, filtro, orden, impresión, `return 0`)
- 147-149 → subparser `since`

## Mutantes sobre líneas de la feature — TODOS MUERTOS (100%)
- `src/cli.py:100`  operador  `'>=' -> '>'`            → muerto
  (lo mata `test_since_includes_note_created_on_exact_date` / `..._excludes_earlier_includes_later`:
   con `>` el límite inclusivo exacto dejaría fuera la nota del día exacto.)
- `src/cli.py:101`  palabra   `'True' -> 'False'`       → muerto
  (lo mata `test_since_orders_matches_by_created_at_desc`: el orden dejaría de ser descendente.)
- `src/cli.py:104`  número    `'0' -> '1'`              → muerto
- `src/cli.py:104`  retorno   `'return 0' -> 'return None'` → muerto
  (cualquier escenario de éxito espera exit 0; `1`/`None` rompe el contrato.)

Las líneas 11-12 (constantes) y 147-149 (subparser) no generan mutantes
mutables por el catálogo (definiciones/strings), o sus mutantes no compilan.
La validación de fecha (línea 96, `strptime` + `ValueError`) está cubierta por
`test_since_invalid_date_format_is_error` y `test_since_impossible_calendar_date_is_error`,
pero `strptime`/`raise` no producen mutantes en el catálogo actual.

## Mutantes sobrevivientes — FUERA DEL ALCANCE de la feature (código heredado/compartido)
Se miden pero NO bloquean (regla de `docs/mutation-testing.md`: el umbral solo
aplica a líneas nuevas/tocadas; el heredado no tocado se mide, no se exige).
Ninguno pertenece a `cmd_since` ni a su subparser:

- `src/cli.py:64`  número  `'0' -> '1'`   → en `cmd_recent` (feature #11, no tocada por `since`)
  Falta: test que distinga `--limit 0` (error) de `--limit 1`.
- `src/cli.py:68`  número  `'0' -> '1'`   → en `cmd_recent` (rama almacén vacío → `return 0`)
  Falta: test que afirme exit 0 exacto de `recent` con almacén vacío.
- `src/cli.py:115` palabra `'True' -> 'False'` → en `build_parser` (`required=True` de subparsers; infraestructura compartida)
  Falta: test que afirme que invocar sin subcomando es error (exit != 0).
- `src/cli.py:164` retorno `'return 1' -> 'return None'` → en `main` (rama de error de `NoteError`; infraestructura compartida)
  Falta: test que afirme exit code == 1 exacto en la rama de error de `main`.

> Estos 4 sobrevivientes son trabajo del `tdd_craftsman` para sus features
> respectivas (`recent` y/o el contrato de `main`/`build_parser`), no de `cli_since`.

## Conclusión
La puntuación de mutación de la feature `cli_since` sobre sus líneas
nuevas/tocadas es **100%**: todos los mutantes generados en `cmd_since` y su
camino mueren con la suite actual. Cumple el umbral. **PASA.**
