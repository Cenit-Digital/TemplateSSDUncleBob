# Judge — feature `since` (rust-notes-cli)

**Veredicto:** APROBADO

Revisión del trabajo del `tdd_craftsman` contra `features/cli_since.feature`,
`project-spec.md` y `CHECKPOINTS.md`.

## Cobertura de escenarios

| Escenario | Test |
|-----------|------|
| @s1 límite inclusivo | `since_boundary_is_inclusive` |
| @s2 anteriores fuera / posteriores dentro | `since_boundary_is_inclusive` (excluye 2026-04-30) |
| @s3 orden descendente | `since_descending_order` |
| @s4 formato de línea | `since_boundary_is_inclusive` / `list_format_is_id_date_title` |
| @s5 formato inválido | `since_invalid_format_fails` |
| @s6 rango imposible | `since_out_of_range_date_fails` |
| @s7 sin coincidencias | `since_no_matches_is_silent` |
| @s8 almacén vacío | `since_empty_store_is_silent` |

## Observaciones

- **Contrato de errores** respetado: dominio → stderr + código 1; salida útil →
  stdout. Verificado con aserciones de código de salida **exacto**.
- **No muta el archivo:** `since` solo llama a `load`, nunca a `save`.
- **Formato compartido:** `since` reutiliza `print_lines`, sin inventar un
  segundo contrato de presentación.
- **Divergencia documentada:** `valid_date` valida rango, no calendario
  completo (no rechaza `2026-02-30`). Está declarado en el propio código y en
  `project-spec.md`, y no afecta a los escenarios pedidos. Aceptado como
  decisión de alcance consciente, no como agujero.

APROBADO → pasa a la puerta de mutación.
