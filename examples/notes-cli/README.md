# ejemplo-harness — Notes CLI · rama `uncle-bob-harness`

Esta rama reorganiza el mismo `notes-cli` alrededor del proceso de
**Robert C. Martin (Uncle Bob)** descrito en su hilo: conversar la spec,
destilarla en escenarios **Gherkin**, tallar el código con **TDD estricto**,
podar con **juicio** y validar con **prueba de mutación**.

> El código de la app es deliberadamente simple. Lo importante no es **qué**
> hace, sino **cómo** está estructurado para que un agente trabaje de forma
> autónoma y verificable — y, en esta rama, con la disciplina del artesano.

## El pipeline

```
pending
  → [spec_partner]    CONVERSACIÓN  → project-spec.md
  → [gherkin_author]  DESTILACIÓN   → features/<name>.feature   (spec_ready)
  → ⏸  PUERTA HUMANA: el humano aprueba los escenarios
  → in_progress
  → [tdd_craftsman]   ROJO → VERDE → REFACTOR  → src/ + tests/
  → [judge]           REVIEW ("el juego entero")
  → [mutation_tester] MUTACIÓN (valida que los tests muerden)
  → done
```

Una sola feature a la vez. Una sola puerta de aprobación humana: sobre el
contrato Gherkin, **antes** de escribir producción.

## Los insights del hilo, mapeados a cada paso

| Paso              | Idea del hilo                                                                 | Dónde vive en el repo            |
|-------------------|--------------------------------------------------------------------------------|----------------------------------|
| Spec conversada   | "I have the AI write the spec by having a conversation… we debate decisions"   | `spec_partner` → `project-spec.md` |
| Gherkin           | "create a set of .feature files from the project-spec.md"                      | `gherkin_author` → `features/`   |
| TDD               | "single test followed by code (TDD)" — un test a la vez                        | `tdd_craftsman`, `docs/tdd.md`   |
| Review            | "The review step is the whole game. Agents draft, judgment prunes."            | `judge`                          |
| Mutación          | "Mutation testing is resource-heavy, but the ROI… is worth every cycle."       | `mutation_tester`, `tools/mutate.py` |
| Compute-bound     | "Raw computer power is the limiting factor" — el cuello es validar, no teclear | la mutación reejecuta la suite por cada mutante |

Detalle completo en **`docs/workflow.md`** (insight por fase).

## Los agentes

| Agente            | Rol                                                                 | Escribe                              |
|-------------------|----------------------------------------------------------------------|--------------------------------------|
| `craftsman_lead`  | Orquesta las 5 fases. No implementa. Custodia las puertas.           | `feature_list.json` (transiciones)   |
| `spec_partner`    | Conversa y **debate** la spec con el humano.                         | `project-spec.md`                    |
| `gherkin_author`  | Destila la spec en escenarios `.feature`.                            | `features/<name>.feature`            |
| `tdd_craftsman`   | TDD estricto, un test a la vez (Tres Leyes del TDD).                 | `src/`, `tests/`, `progress/tdd_*`   |
| `judge`           | El review es el juego: aprueba o **poda**. No edita código.          | `progress/judge_*`                   |
| `mutation_tester` | Mide si los tests **muerden**. No edita código.                     | `progress/mutation_*`                |

Definiciones en `.claude/agents/`.

## Probarlo tú mismo con Claude Code

Abre Claude Code en la raíz del repo: `CLAUDE.md` fuerza al modelo a actuar
como `craftsman_lead` (orquesta, no edita código) y `docs/workflow.md` impone
el pipeline.

1. `./init.sh` — debe terminar verde.
2. En `feature_list.json` deja una feature con `status: "pending"` y
   `"sdd": true` (p. ej. la #9 `cli_export`).
3. Lanza `claude` y pide: **«implementa la siguiente feature pendiente»**.

Lo que ocurre:

- **Fase 1 — Spec.** `spec_partner` debate contigo y escribe/ amplía
  `project-spec.md`. Luego `gherkin_author` destila
  `features/<feature>.feature` y la deja en `spec_ready`. El lead **para y
  te pide aprobación** de los escenarios.
- **Fase 2 — Código.** Tras tu «aprobado», el lead pasa a `in_progress` y
  lanza `tdd_craftsman` (Rojo-Verde-Refactor, un test a la vez), luego
  `judge` (review) y luego `mutation_tester`
  (`python3 tools/mutate.py src/cli.py`). Solo si la mutación supera el
  umbral, la feature pasa a `done`.

Abre `features/`, `project-spec.md` y `progress/` en tu editor mientras
Claude trabaja: cada informe aparece en cuanto el subagente termina. Esa es
la regla anti-teléfono-descompuesto — el contenido vive en disco, no en chat.

## Ejemplo ya ejecutado en esta rama: `cli_count` (#8)

Esta rama incluye un recorrido completo end-to-end de la feature `cli_count`,
listo para inspeccionar (o filmar):

| Artefacto                        | Qué muestra                                              |
|----------------------------------|----------------------------------------------------------|
| `features/cli_count.feature`     | El contrato: 7 escenarios `@s1..@s7`                      |
| `progress/tdd_cli_count.md`      | Bitácora Rojo-Verde-Refactor + mapa `@s → test`          |
| `progress/judge_cli_count.md`    | Veredicto del review (APPROVED) + checkpoints            |
| `progress/mutation_cli_count.md` | Score de mutación: **100%** sobre las líneas de la feature |
| `src/cli.py`, `tests/test_cli.py`| El código y sus 7 tests (uno por escenario)              |

Reproduce la prueba de mutación:

```bash
python3 tools/mutate.py src/cli.py
```

## Para usar la app (humanos)

```bash
python3 -m src.cli add "comprar pan" --body "y leche"
python3 -m src.cli list
python3 -m src.cli count
```

## Estructura

```
.
├── AGENTS.md                 # Mapa para agentes (divulgación progresiva)
├── CHECKPOINTS.md            # Criterios de "estado final correcto" (C1–C7)
├── CLAUDE.md                 # Fuerza el rol craftsman_lead
├── feature_list.json         # Alcance: una feature a la vez
├── init.sh                   # Verificación e inicialización
├── project-spec.md           # Spec conversada (spec_partner)
├── features/<name>.feature   # Contrato Gherkin (gherkin_author)
├── progress/
│   ├── current.md            # Sesión activa (estado vivo)
│   ├── history.md            # Bitácora append-only
│   ├── tdd_<name>.md         # Bitácora TDD + trazabilidad
│   ├── judge_<name>.md       # Veredicto del review
│   └── mutation_<name>.md    # Informe de mutación
├── docs/
│   ├── workflow.md           # El pipeline y los insights de cada fase
│   ├── tdd.md                # Las Tres Leyes del TDD; Rojo-Verde-Refactor
│   ├── gherkin.md            # Cómo escribir .feature; de Gherkin a test
│   ├── mutation-testing.md   # Por qué/cómo; umbral; tools/mutate.py
│   ├── architecture.md       # Qué significa "buen trabajo"
│   ├── conventions.md        # Estilo, nombres, errores
│   └── verification.md       # Cómo demostrar que funciona
├── tools/
│   └── mutate.py             # Mutador sin dependencias
├── .claude/
│   ├── agents/               # craftsman_lead, spec_partner, gherkin_author,
│   │                         #   tdd_craftsman, judge, mutation_tester
│   └── settings.json         # Hooks que automatizan la verificación
├── src/
│   ├── storage.py            # Persistencia atómica (JSON)
│   ├── notes.py              # Modelo de dominio
│   └── cli.py                # Interfaz argparse
└── tests/
    ├── test_storage.py
    ├── test_notes.py
    └── test_cli.py
```

## Aprendizajes que ilustra esta rama

- **La spec nace de un debate**, no de un dictado: el `spec_partner`
  cuestiona casos límite y registra decisiones con su porqué.
- **Gherkin como contrato ejecutable**: la ambigüedad se resuelve antes de
  escribir código, en el punto de máximo apalancamiento (la puerta humana).
- **TDD estricto**: un test a la vez; nada de producción sin un test rojo
  que la pida. El alcance no se infla.
- **El review es el juego entero**: generar borradores es barato; el juicio
  que poda es el valor escaso.
- **La validación es compute-bound**: la prueba de mutación demuestra que
  los tests muerden, a costa de CPU. El límite ya no es teclear, es validar.
- **Estado en disco, no en chat**: `project-spec.md`, `features/` y
  `progress/` sobreviven a reinicios y context windows reventadas.
