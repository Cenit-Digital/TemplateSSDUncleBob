# project-spec.md — rust-notes-cli

> Especificación **conversada**, no dictada. Cada sección nace de un debate
> entre el humano y el `spec_partner`: qué hace, cuál es el contrato exacto,
> qué casos límite existen y qué alternativas se descartaron y por qué.
> De aquí el `gherkin_author` destila `features/<name>.feature`.

## Propósito del proyecto

`rust-notes-cli` es el gemelo en Rust del ejemplo de referencia
`examples/python-notes-cli`: un gestor de notas minimalista por línea de
comandos. El código es deliberadamente simple; el repo enseña **proceso**
(Harness Engineering, edición artesano), no complejidad de dominio. Este
ejemplo demuestra el mismo flujo en el stack Rust.

## Decisiones globales

- **Sin dependencias externas.** `Cargo.toml` no declara `[dependencies]`: todo
  se hace con la stdlib. Esto mantiene el arnés reproducible y permite el
  mutador casero (`tools/mutate.rs`) sin descargas por red. *Consecuencia
  interesante para Rust:* como la stdlib **no trae JSON** (a diferencia de
  Python/Node/Go), el ejemplo implementa un JSON mínimo a mano en `src/json.rs`
  — que se convierte en dominio con sustancia para la prueba de mutación.
  *Alternativa descartada:* `serde`/`serde_json` — es lo que usaría un proyecto
  real, pero introduce dependencias y esconde el mecanismo.
- **Mutación con mutador propio, no cargo-mutants.** Los otros tres ejemplos
  (Python/Node/Go) traen su mutador de ~200 líneas sin dependencias; este
  espeja esa decisión con `tools/mutate.rs` para que el ejemplo sea
  autocontenido y determinista en CI (sin `cargo install` por red). El
  adaptador `.harness/adapters/rust.md` documenta
  [cargo-mutants](https://github.com/sourcefrog/cargo-mutants) como la
  herramienta de referencia para un proyecto Rust **de producción**.
- **Tests colocados en `src/`.** La convención de Rust: los tests unitarios van
  en un módulo `#[cfg(test)]` dentro del mismo `.rs`. El mutador **enmascara**
  esos módulos para no mutar el código de test (el equivalente a que el mutador
  Go solo mute `cli.go`, no `cli_test.go`). `paths.tests` apunta a `src/` por
  eso.
- **Dominio en la librería, pegamento en `main.rs`.** Toda la lógica (y por
  tanto los mutantes que hay que matar) vive en la librería `notes`
  (`src/lib.rs` + módulos). `src/main.rs` es el pegamento que traduce
  `env::args`, la variable `NOTES_FILE` y el reloj del sistema en una llamada a
  `cli::run`, y queda **fuera** de la prueba de mutación a propósito. En
  particular, la conversión "instante del reloj → ISO 8601" (algoritmo civil de
  Howard Hinnant, sin `chrono`) vive ahí: es entorno, no dominio.
- **Inyección de dependencias para testear.** `cli::run` recibe la ruta del
  almacén, el `created_at` de una nota nueva (`now`) y los flujos de
  salida/error como parámetros. Así los tests son deterministas y corren en
  paralelo sin tocar estado global (nada de `set_var` con carreras entre hilos).
- **Almacén JSON atómico.** Las notas viven en un único archivo JSON
  (`NOTES_FILE`, por defecto `.notes.json`). La escritura es atómica (temporal
  contiguo `<path>.tmp` + `fs::rename`). *Razón:* nunca dejar el archivo a
  medias si el proceso muere.
- **Contrato de errores uniforme.** Los errores de dominio se imprimen en
  **stderr** y devuelven **código de salida 1**. La salida útil va a **stdout**.
- **Una nota = `{id, title, body, created_at}`.** `id` incremental (id de la
  última nota + 1), `created_at` en ISO 8601 (RFC 3339) normalizado a UTC.

## Comandos

### `count` — contar notas  *(feature #5, done)*

- **Contrato:** `notes count` → stdout: el total como entero pelado, código 0.
  Almacén vacío o inexistente → `0`. No modifica el archivo.

### `recent` — N notas más recientes  *(feature #6, done)*

- **Contrato:** `notes recent` → hasta 5 notas, orden `created_at` desc.
  `--limit K` cambia el número. `--limit <= 0`, sin valor, o valor no entero →
  stderr y código 1. Almacén vacío → nada, código 0. Formato por línea:
  `<id>\t<created_at>\t<title>` (igual que `list`).

### `since` — filtrar por fecha  *(feature #7, done — feature de ejemplo del flujo)*

- **Propósito:** ver "lo que apunté desde el lunes" — las notas creadas en una
  fecha de calendario dada o después de ella.
- **Contrato:**
  - `notes since 2026-05-01` → stdout: las notas con fecha de creación
    `>= 2026-05-01`, una por línea, formato `<id>\t<created_at>\t<title>`, orden
    por `created_at` **descendente**; código 0.
  - El argumento se valida con `valid_date`. Si NO es una fecha con formato
    `YYYY-MM-DD` o su mes/día están fuera de rango (`2026/05/01`, `2026-13-40`)
    → mensaje claro en **stderr**, código 1.
  - Comparación por **fecha de calendario, límite inclusivo**: se toma la parte
    de fecha de `created_at` (primeros 10 caracteres) y se incluye la nota si
    esa fecha es **>=** la fecha dada. Una nota creada a las 23:00 del día exacto
    cuenta.
  - Ninguna nota cumple, o almacén vacío/inexistente → nada, código 0.
  - El comando **no modifica** el archivo.
- **Decisiones:**
  - *Validación de rango, no calendario completo.* A diferencia de Go
    (`time.Parse`), `valid_date` comprueba formato + mes 1..=12 + día 1..=31,
    pero **no** rechaza días imposibles de un mes concreto (`2026-02-30` se
    aceptaría). Es una decisión deliberada para mantener el validador sin
    dependencias y pequeño; un proyecto real usaría `chrono`/`time`. La
    divergencia está documentada en el propio `valid_date` y no afecta a los
    escenarios pedidos (`2026/05/01`, `2026-13-40` sí se rechazan).
  - *Comparación por fecha de calendario, inclusiva.* El modelo mental del
    usuario es "día", no "instante". *Alternativa descartada:* comparar
    instantes tomando la fecha como medianoche — excluiría notas del propio día
    creadas tras las 00:00.

### `add` / `list` — soporte  *(feature #4, done)*

Necesarios para sembrar y ver notas. `add <título>` crea una nota (cuerpo vacío
desde la CLI; el modelo conserva `body` para round-trip del JSON sembrado) e
imprime `id=<n>`. `list` imprime todas con el formato compartido.

## Nota sobre el alcance

Este ejemplo cubre el alcance funcional pedido para el gemelo Rust: **contar /
recientes / desde una fecha**, más `add`/`list` como soporte. No reimplementa
`show`/`delete`/`search`/`edit` del ejemplo Python: no aportan al objetivo
didáctico (mostrar el flujo y la mutación al 100% en Rust) y sí ampliarían la
superficie sin necesidad.

## Preguntas abiertas

_(ninguna por ahora)_
