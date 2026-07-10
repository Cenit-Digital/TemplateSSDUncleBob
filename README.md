# TemplateSSDUncleBob — El arnés SSD de Uncle Bob (edición artesano)

Plantilla reutilizable de GitHub para **arrancar cualquier proyecto de
software con disciplina de artesano**. Reorganiza el trabajo de un agente de
IA alrededor del proceso que Robert C. Martin (Uncle Bob) describe: primero
**conversar la spec**, luego **destilarla en escenarios Gherkin**, después
**tallar el código con TDD estricto**, **podar con juicio** en el review y
por último **validar con prueba de mutación**.

> Lo importante no es *qué* construyes, sino *cómo*: un arnés que fuerza a un
> agente a trabajar de forma autónoma, verificable y con una sola puerta de
> aprobación humana en el punto de máximo apalancamiento (el contrato).

---

## Qué es esto

Un esqueleto limpio y genérico, listo para empezar un proyecto nuevo. Trae:

- El **rol obligatorio `craftsman_lead`** (`CLAUDE.md`): en este repo Claude
  orquesta y custodia la disciplina, **no** implementa a mano.
- Un **mapa de navegación** para agentes (`AGENTS.md`) con divulgación
  progresiva.
- **Checkpoints objetivos** de estado final correcto (`CHECKPOINTS.md`).
- La **documentación del método** en `docs/` (workflow, TDD, Gherkin,
  mutación, arquitectura, convenciones, verificación).
- Los **6 subagentes** en `.claude/agents/`.
- Un **mutador sin dependencias** (`tools/mutate.py`).
- Un **ejemplo trabajado end-to-end** en `examples/notes-cli/`.

Python es el **stack de referencia**, pero el arnés se generaliza a otros
lenguajes con una capa de adaptación (`docs/stack-adapter.md`).

---

## Cómo usarlo

1. En GitHub, pulsa **«Use this template»** para crear tu repositorio nuevo a
   partir de esta plantilla.
2. Clónalo y abre **Claude Code en la raíz** del repo. `CLAUDE.md` se carga
   solo y fuerza al modelo a actuar como `craftsman_lead`.
3. Pídele: **«implementa la siguiente feature pendiente»**.

A partir de ahí, el `craftsman_lead` recorre el pipeline: conversa la spec,
destila el Gherkin, **para y te pide que apruebes los escenarios**, y solo
entonces talla el código con TDD, review y mutación.

---

## El pipeline (5 fases, 1 puerta humana)

```
pending
  → [spec_partner]    CONVERSACIÓN  ──►  project-spec.md
  → [gherkin_author]  DESTILACIÓN   ──►  features/<name>.feature   (spec_ready)
  → ⏸  PUERTA HUMANA: el humano aprueba los escenarios (el contrato)
  → in_progress
  → [tdd_craftsman]   ROJO → VERDE → REFACTOR  ──►  src/ + tests/
  → [judge]           REVIEW (el juego entero)
  → [mutation_tester] MUTACIÓN (valida que los tests muerden)
  → done
```

Una sola feature a la vez. **Una sola puerta de aprobación humana**: sobre el
contrato Gherkin, *antes* de escribir producción. Aprobar el `.feature` es
barato; aprobar código ya escrito es caro.

---

## Los 6 agentes

| Agente            | Rol                                                        | Escribe                              |
|-------------------|------------------------------------------------------------|--------------------------------------|
| `craftsman_lead`  | Orquesta las 5 fases. No implementa. Custodia las puertas. | `feature_list.json` (transiciones)   |
| `spec_partner`    | Conversa y **debate** la spec con el humano.               | `project-spec.md`                    |
| `gherkin_author`  | Destila la spec en escenarios `.feature`.                  | `features/<name>.feature`            |
| `tdd_craftsman`   | TDD estricto, un test a la vez (Tres Leyes del TDD).       | `src/`, `tests/`, `progress/tdd_*`   |
| `judge`           | El review es el juego: aprueba o **poda**. No edita código.| `progress/judge_*`                   |
| `mutation_tester` | Mide si los tests **muerden**. No edita código.            | `progress/mutation_*`                |

Definiciones completas en `.claude/agents/`.

---

## Tu primera feature

1. Edita `feature_list.json` y añade (o deja) una feature con
   `"status": "pending"` y `"sdd": true`, con un `name`, `title`,
   `description` y una lista de `acceptance`.
2. Lanza Claude Code y pide **«implementa la siguiente feature pendiente»**.
3. **Fase spec.** `spec_partner` debate contigo casos límite y contratos de
   salida y escribe/amplía `project-spec.md`. Luego `gherkin_author` destila
   `features/<name>.feature` y deja la feature en `spec_ready`. El lead
   **para y te pide aprobación**.
4. **Aprueba** los escenarios (o pide cambios). Con tu «aprobado», el lead
   pasa la feature a `in_progress`.
5. **Fase código.** `tdd_craftsman` recorre cada escenario `@s` con ciclos
   Rojo-Verde-Refactor, `judge` revisa y `mutation_tester` corre la prueba de
   mutación. Solo si supera el umbral, la feature pasa a `done`.

Abre `features/`, `project-spec.md` y `progress/` en tu editor mientras
Claude trabaja: cada informe aparece en cuanto el subagente termina. Es la
**regla anti-teléfono-descompuesto** — el contenido vive en disco, no en el
chat.

---

## Ejemplo trabajado: `examples/notes-cli/`

Un CLI de notas minúsculo, recorrido de punta a punta con el método:
**43 tests verdes** y features validadas con prueba de mutación (por ejemplo,
`cli_count` con score 100% sobre las líneas de la feature). No lo edites — es
la referencia viva del arnés en acción.

```bash
cd examples/notes-cli
./init.sh                          # verifica entorno + corre los 43 tests
python3 tools/mutate.py src/cli.py # reproduce la prueba de mutación
```

Inspecciona `progress/tdd_cli_count.md`, `progress/judge_cli_count.md` y
`progress/mutation_cli_count.md` para ver el rastro completo de una feature.

> **Windows.** Si ves errores de codificación con los caracteres de color o
> los símbolos ✅/❌, exporta `PYTHONUTF8=1` antes de correr los comandos
> (p. ej. `PYTHONUTF8=1 python3 tools/mutate.py src/cli.py`).

---

## Otros lenguajes: la capa de adaptación

Python es el stack **de referencia** (es lo que `init.sh` y `tools/mutate.py`
asumen por defecto), pero el método no es específico de Python. Para llevar
el arnés a otro lenguaje, lee **`docs/stack-adapter.md`**: mapea las tres
piezas dependientes del stack — la verificación de `init.sh`, el runner de
tests y la prueba de mutación — a tu ecosistema, sin tocar el pipeline ni las
reglas duras. El arnés no hace hard-fail fuera de Python: se adapta.

---

## Documentación viva

El método se documenta y **evoluciona de forma autónoma** en el sitio de
documentación viva:

**https://cenit-digital.github.io/DocsTemplateSSDUncleBob/**

Ahí encontrarás la versión extendida y actualizada del proceso (workflow,
insights por fase, adaptación de stacks) que el propio arnés mantiene al día.

---

## Estructura del repositorio

```
.
├── AGENTS.md                 # Mapa para agentes (divulgación progresiva)
├── CHECKPOINTS.md            # Criterios de "estado final correcto" (C1–C7)
├── CLAUDE.md                 # Fuerza el rol craftsman_lead
├── README.md                 # Este archivo
├── init.sh                   # Verificación e inicialización del entorno
├── feature_list.json         # Alcance: una feature a la vez
├── project-spec.md           # Spec conversada (spec_partner)
├── features/                 # Contratos Gherkin <name>.feature (gherkin_author)
├── progress/
│   ├── current.md            # Sesión activa (estado vivo)
│   ├── history.md            # Bitácora append-only
│   ├── tdd_<name>.md         # Bitácora TDD + trazabilidad @s → test
│   ├── judge_<name>.md       # Veredicto del review
│   └── mutation_<name>.md    # Informe de mutación
├── docs/
│   ├── workflow.md           # El pipeline y los insights de cada fase
│   ├── tdd.md                # Las Tres Leyes del TDD; Rojo-Verde-Refactor
│   ├── gherkin.md            # Cómo escribir .feature; de Gherkin a test
│   ├── mutation-testing.md   # Por qué/cómo; umbral; tools/mutate.py
│   ├── architecture.md       # Qué significa "buen trabajo"
│   ├── conventions.md        # Estilo, nombres, errores
│   ├── verification.md       # Cómo demostrar que funciona
│   └── stack-adapter.md      # Cómo adaptar el arnés a otro lenguaje
├── tools/
│   └── mutate.py             # Mutador sin dependencias (Python de referencia)
├── .claude/
│   ├── agents/               # craftsman_lead, spec_partner, gherkin_author,
│   │                         #   tdd_craftsman, judge, mutation_tester
│   └── settings.json         # Hooks que automatizan la verificación
├── src/                      # Tu código (vacío al empezar)
├── tests/                    # Tus tests (vacío al empezar)
└── examples/
    └── notes-cli/            # Ejemplo trabajado end-to-end (no editar)
```

---

## Atribución

Método inspirado en las ideas de **Robert C. Martin (Uncle Bob)** sobre TDD
y prueba de mutación, y en el trabajo de **BettaTech**
([github.com/betta-tech/harness-sdd](https://github.com/betta-tech/harness-sdd)),
del que esta plantilla generaliza el arnés.

> **Nota sobre las citas.** Las frases-lema que verás en la documentación del
> método — «el review es el juego entero», «los agentes redactan, el juicio
> poda», «la potencia de cómputo es el factor limitante», «el ROI de la
> mutación vale cada ciclo» — son **formulaciones didácticas de BettaTech**,
> no citas literales de Robert C. Martin. Las posiciones verificadas de Uncle
> Bob que sí se citan son las Tres Leyes del TDD y su tratamiento de la prueba
> de mutación como medida de la estabilidad semántica de una suite.
