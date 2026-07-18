# project-spec.md — go-notes-cli

> Especificación **conversada**, no dictada. Cada sección nace de un debate
> entre el humano y el `spec_partner`: qué hace, cuál es el contrato exacto,
> qué casos límite existen y qué alternativas se descartaron y por qué.
> De aquí el `gherkin_author` destila `features/<name>.feature`.

## Propósito del proyecto

`go-notes-cli` es el gemelo en Go del ejemplo de referencia
`examples/python-notes-cli`: un gestor de notas minimalista por línea de
comandos. El código es deliberadamente simple; el repo enseña **proceso**
(Harness Engineering, edición artesano), no complejidad de dominio. Este
ejemplo demuestra el mismo flujo en el stack Go.

## Decisiones globales

- **Sin dependencias externas.** `go.mod` no declara requires: todo se hace con
  la stdlib (`encoding/json`, `os`, `time`, `sort`, `flag` no hace falta). Esto
  mantiene el arnés reproducible y permite el mutador casero
  (`tools/mutate.go`, sobre `go/scanner`). *Alternativa descartada:* librerías
  de CLI como `cobra` — más ergonómicas, pero introducen dependencias y ocultan
  el mecanismo.
- **Mutación con mutador propio, no gremlins.** Los otros dos ejemplos
  (Python/Node) traen su mutador de ~200 líneas sin dependencias; este espeja
  esa decisión con `tools/mutate.go` para que el ejemplo sea autocontenido y
  determinista en CI (sin `go install` por red). El adaptador
  `.harness/adapters/go.md` documenta [gremlins](https://github.com/go-gremlins/gremlins)
  como la herramienta de referencia para un proyecto Go **de producción**.
- **Layout `src/` + `cmd/`.** La lógica vive en el paquete `src` (reutilizable y
  testeable en proceso); `cmd/notes/main.go` es el pegamento que conecta
  `os.Args` y los flujos estándar. Los tests van **junto al código** en `src/`
  (`*_test.go`), como manda la convención de Go. El nombre de paquete `src` es
  deliberado: espeja el `from src import ...` de Python y el `src/` de Node.
- **Almacén JSON atómico.** Las notas viven en un único archivo JSON
  (`NOTES_FILE`, por defecto `.notes.json`). La escritura es atómica (temporal
  en el mismo directorio + `os.Rename`). *Razón:* nunca dejar el archivo a
  medias si el proceso muere.
- **Contrato de errores uniforme.** Los errores de dominio se imprimen en
  **stderr** y devuelven **código de salida 1**. La salida útil va a **stdout**.
  Cada comando es componible y testeable por su contrato observable.
- **Una nota = `{id, title, body, created_at}`.** `id` incremental (id de la
  última nota + 1, dado que se guardan en orden de creación), `created_at` en
  ISO 8601 (RFC3339) normalizado a UTC.

## Comandos

### `count` — contar notas  *(feature #4, done)*

- **Contrato:** `notes count` → stdout: el total como entero pelado, código 0.
  Almacén vacío o inexistente → `0`. No modifica el archivo.
- **Decisión:** salida = entero pelado (`3`, no `Total: 3`), componible con
  `| wc`, `$(...)`, etc.

### `recent` — N notas más recientes  *(feature #5, done)*

- **Contrato:** `notes recent` → hasta 5 notas, orden `created_at` desc.
  `--limit K` cambia el número. `--limit <= 0`, sin valor, o valor no entero →
  stderr y código 1. Almacén vacío → nada, código 0. Formato por línea:
  `<id>\t<created_at>\t<title>` (igual que `list`).
- **Decisión:** mismo formato que `list`; no inventar un segundo contrato de
  presentación.

### `since` — filtrar por fecha  *(feature #6, done — feature de ejemplo del flujo)*

- **Propósito:** ver "lo que apunté desde el lunes" — las notas creadas en una
  fecha de calendario dada o después de ella.
- **Contrato:**
  - `notes since 2026-05-01` → stdout: las notas con fecha de creación
    `>= 2026-05-01`, una por línea, formato `<id>\t<created_at>\t<title>`, orden
    por `created_at` **descendente**; código 0.
  - El argumento se valida con `time.Parse("2006-01-02", arg)`. Si NO es una
    fecha real y válida —por formato (`2026/05/01`, `mayo`) o por fecha imposible
    (`2026-13-40`, `2026-02-30`)— → mensaje claro en **stderr**, código 1.
    (`time.Parse` de Go es estricto con los rangos: rechaza meses/días fuera de
    rango.)
  - Comparación por **fecha de calendario, límite inclusivo**: se toma la parte
    de fecha de `created_at` (`created_at[:len(date)]`) y se incluye la nota si
    esa fecha es **>=** la fecha dada. Una nota creada a las 23:00 del día exacto
    cuenta.
  - Ninguna nota cumple, o almacén vacío/inexistente → nada, código 0.
  - El comando **no modifica** el archivo.
- **Decisiones:**
  - *Validación con `time.Parse` estricto.* El usuario merece un error claro
    ante `2026-13-40`, no un filtrado silencioso. *Alternativa descartada:*
    validar solo el patrón `YYYY-MM-DD` con una regex — deja pasar fechas
    imposibles.
  - *Comparación por fecha de calendario, inclusiva.* El modelo mental del
    usuario es "día", no "instante". *Alternativa descartada:* comparar instantes
    tomando la fecha como medianoche — excluiría notas del propio día creadas
    tras las 00:00.

### `add` / `list` — soporte  *(feature #3, done)*

Necesarios para sembrar y ver notas. `add <título>` crea una nota (cuerpo vacío
desde la CLI; el modelo conserva `body` para round-trip del JSON sembrado) e
imprime `id=<n>`. `list` imprime todas con el formato compartido.

## Nota sobre el alcance

Este ejemplo cubre el alcance funcional pedido para el gemelo Go: **contar /
recientes / desde una fecha**, más `add`/`list` como soporte. No reimplementa
`show`/`delete`/`search`/`edit` del ejemplo Python: no aportan al objetivo
didáctico (mostrar el flujo y la mutación al 100% en Go) y sí ampliarían la
superficie sin necesidad.

## Preguntas abiertas

_(ninguna por ahora)_
