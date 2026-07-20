# Historial — rust-notes-cli

Ejemplo de referencia del stack Rust, construido con el flujo Uncle Bob completo.

- **json_layer** (#1) — JSON mínimo sin dependencias (to_json/from_json), con
  round-trip exacto, escapado y UTF-8. Mutación 100%.
- **storage_layer** (#2) — load/save atómico sobre archivo JSON. Mutación 100%.
- **note_model** (#3) — tipo `Note` y `next_id`/`new_note`. Mutación 100%.
- **cli_add_list** (#4) — comandos `add` y `list`.
- **cli_count** (#5) — comando `count`.
- **cli_recent** (#6) — comando `recent` con `--limit`.
- **cli_since** (#7) — comando `since`, recorrido de punta a punta como ejemplo
  del pipeline (spec → gherkin → TDD → judge → mutación). Mutación 100%.

Cierre: `cargo test` verde (58 tests) y mutación 100% en los cuatro módulos
objetivo (`cli.rs`, `notes.rs`, `json.rs`, `storage.rs`). Ver
`progress/mutation_since.md`.
