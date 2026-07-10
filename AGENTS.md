# AGENTS.md — Mapa de navegación para agentes de IA

> Punto de entrada para cualquier agente que trabaje en este repositorio.
> NO es una biblia de reglas: es un **mapa**. Lee solo lo que necesites,
> cuando lo necesites (divulgación progresiva).
>
> Proceso: **Harness / SDD estilo Uncle Bob** — conversación → Gherkin → TDD →
> review → mutación. Ver `docs/workflow.md`. Plantilla **agnóstica al
> lenguaje**: los comandos del stack viven en `harness.config.json`.

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` (o `bin/harness init`). Si falla, **para** y resuelve
   el entorno antes de tocar código.
2. Lee `progress/current.md` (estado de la última sesión).
3. Lee `feature_list.json`. Toda feature `"sdd": true` recorre el pipeline.
4. Lee `docs/workflow.md` antes de coordinar nada.

## 2. Mapa del repositorio

| Archivo / carpeta          | Qué contiene                                                              | Cuándo leerlo                     |
| -------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `harness.config.json`      | ⭐ Comandos de TU stack (test, mutación, lint…). El único punto no-agnóstico | Antes de tocar el arnés           |
| `feature_list.json`        | Tareas con estado (`pending`/`spec_ready`/`in_progress`/`done`/`blocked`) | Siempre                           |
| `progress/current.md`      | Estado de la sesión actual                                                | Siempre                           |
| `progress/history.md`      | Bitácora append-only                                                      | Si necesitas contexto             |
| `project-spec.md`          | Spec conversada por feature                                               | Antes de Gherkin o de implementar |
| `features/<name>.feature`  | Escenarios Gherkin (contrato aprobado por el humano)                      | Antes del ciclo TDD               |
| `docs/workflow.md`         | El pipeline completo y los insights de cada fase                          | Antes de coordinar                |
| `docs/tdd.md`              | Las Tres Leyes; Rojo-Verde-Refactor                                       | Antes de escribir código          |
| `docs/gherkin.md`          | Cómo escribir `.feature`; de Gherkin a test                               | Antes de redactar escenarios      |
| `docs/mutation-testing.md` | Por qué y cómo; umbral; mutación por stack                                | Antes de validar la suite         |
| `docs/architecture.md`     | Qué significa "hacer un buen trabajo"                                     | Antes de implementar              |
| `docs/conventions.md`      | Estilo, nombres, estructura                                               | Antes de escribir código          |
| `docs/verification.md`     | Cómo demostrar que funciona                                               | Antes de declarar `done`          |
| `docs/configuration.md`    | Cómo adaptar `harness.config.json` a cualquier stack                      | Al portar a un nuevo lenguaje     |
| `docs/tooling.md`          | Agentes de apoyo y hooks                                                  | Para entender el tooling          |
| `CHECKPOINTS.md`           | Criterios objetivos de "estado final correcto"                           | Para auto-evaluarte               |
| `.harness/harness.mjs`     | Motor agnóstico (lee la config y ejecuta tus comandos)                    | Si depuras el arnés               |
| `.claude/agents/`          | 6 subagentes del pipeline + 3 de apoyo                                     | Si orquestas                      |
| `examples/`                | Arneses completos y ejecutables (Python y Node/TS) de referencia          | Para ver el método en acción      |
| `src/` · `tests/`          | Código de la aplicación y sus tests                                       | Para implementar / verificar      |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.**
- **No declares `done`** sin tests verdes **y** umbral de mutación superado
  (`bin/harness test` y `bin/harness mutate`).
- **No saltes** la conversación de spec ni la destilación Gherkin para
  features `"sdd": true`.
- **No saltes la puerta humana** sobre los `.feature`.
- **TDD estricto: un test a la vez** (`docs/tdd.md`).
- **Documenta** en `progress/current.md` mientras trabajas.
- **Deja el repo limpio** antes de cerrar (sin logs de debug, sin TODOs sin
  contexto).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.

## 4. Pipeline

```
pending
  → [spec_partner]    CONVERSACIÓN  → project-spec.md
  → [gherkin_author]  DESTILACIÓN   → features/<name>.feature   (spec_ready)
  → ⏸  PUERTA HUMANA: el humano aprueba los escenarios
  → in_progress
  → [tdd_craftsman]   ROJO → VERDE → REFACTOR  → src/ + tests/
  → [judge]           REVIEW ("el review es el juego entero")
  → [mutation_tester] MUTACIÓN (valida que los tests muerden)
  → done
```

## 5. Cierre de sesión (lifecycle)

1. `./init.sh` (o `bin/harness verify`) — todo verde.
2. Mutación sobre lo tocado — por encima del umbral.
3. Si la tarea acabó: `status: "done"` en `feature_list.json`.
4. Mueve el resumen de `progress/current.md` a `progress/history.md`.
5. Vacía `progress/current.md` dejando solo la plantilla.
6. No dejes archivos temporales, ni logs de debug, ni TODOs sin contexto.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si una herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md` y para la sesión.
