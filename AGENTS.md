# AGENTS.md — Mapa de navegación para agentes de IA

> Punto de entrada para cualquier agente que trabaje en este repositorio.
> NO es una biblia de reglas: es un **mapa**. Lee solo lo que necesites,
> cuando lo necesites (divulgación progresiva).
>
> Proceso: lo fija la «Política de trabajo» del final de este fichero (niveles,
> puerta humana, delegación). El pipeline por fases anterior está retirado:
> `docs/workflow.md` queda como legado. Plantilla **agnóstica al lenguaje**: los
> comandos del stack viven en `harness.config.json`.

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` (o `bin/harness init`). Si falla, **para** y resuelve
   el entorno antes de tocar código.
2. Lee `progress/current.md` (estado de la última sesión).
3. Lee `feature_list.json` (el motor lo valida; con `"sdd": true` exige `features/<name>.feature`).
4. Lee la «Política de trabajo» (final de este fichero) antes de planificar.

## 2. Mapa del repositorio

| Archivo / carpeta          | Qué contiene                                                              | Cuándo leerlo                     |
| -------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `harness.config.json`      | ⭐ Comandos de TU stack (test, mutación, lint…). El único punto no-agnóstico | Antes de tocar el arnés           |
| `feature_list.json`        | Tareas con estado (`pending`/`spec_ready`/`in_progress`/`done`/`blocked`) | Siempre                           |
| `progress/current.md`      | Estado de la sesión actual                                                | Siempre                           |
| `progress/history.md`      | Bitácora append-only                                                      | Si necesitas contexto             |
| `project-spec.md`          | Spec conversada por feature                                               | Antes de Gherkin o de implementar |
| `features/<name>.feature`  | Escenarios Gherkin de una feature `"sdd": true` (el motor los exige)      | Antes de implementar esa feature  |
| `docs/workflow.md`         | Legado: el pipeline por fases anterior, retirado (`init` lo exige)        | Solo como referencia              |
| `docs/tdd.md`              | Las Tres Leyes; Rojo-Verde-Refactor                                       | Antes de escribir código          |
| `docs/gherkin.md`          | Cómo escribir `.feature`; de Gherkin a test                               | Antes de redactar escenarios      |
| `docs/mutation-testing.md` | Por qué y cómo; umbral; mutación por stack                                | Antes de validar la suite         |
| `docs/architecture.md`     | Qué significa "hacer un buen trabajo"                                     | Antes de implementar              |
| `docs/conventions.md`      | Estilo, nombres, estructura                                               | Antes de escribir código          |
| `docs/verification.md`     | Cómo demostrar que funciona                                               | Antes de declarar `done`          |
| `docs/configuration.md`    | Cómo adaptar `harness.config.json` a cualquier stack                      | Al portar a un nuevo lenguaje     |
| `docs/tooling.md`          | Agentes de apoyo y hooks                                                  | Para entender el tooling          |
| `docs/modelos.md`          | Qué modelo es `frontier`/`balanced`/`fast` en cada herramienta (con fecha y fuentes) | Al delegar o cambiar de modelo |
| `docs/instrucciones-de-usuario.md` | Plantilla de las instrucciones de usuario compartidas por todos tus repos (los siete pasos) y dónde instalarla en cada herramienta | Al configurar una máquina o una herramienta nueva |
| `CLAUDE.md` · `GEMINI.md`  | Importan este `AGENTS.md`; `CLAUDE.md` añade el arranque (memoria y comandos) | Si usas Claude Code o Gemini CLI |
| `.github/ISSUE_TEMPLATE/` · `.github/pull_request_template.md` | Plantillas de issue de tarea y de PR (cuatro bloques + impacto en tareas anteriores) | Al abrir un issue o un PR |
| `.harness/pr-body.mjs` · `.github/workflows/pr-body.yml` | Comprobador de la descripción del PR (sin LLM) y su workflow; no es check requerido | Si un PR falla «Cuerpo del PR» |
| `docs/autonomous.md`       | El bot de evolución autónoma (solo-PR) y su puesta en marcha              | Para operar el bot de auto-mejora |
| `docs/memoria-organizacional.md` | Patrones validados compartidos entre proyectos (memoria de la org)  | Al arrancar sesión (paso 2bis)    |
| `scripts/sync-memoria.sh(.ps1)` | Sincroniza la memoria organizacional en `.memoria-cache/`           | Paso 2bis del Protocolo de arranque |
| `scripts/harness-upgrade.mjs` · `harness.manifest.json` | `--check`/`--diff`: deriva del proyecto respecto a la plantilla; `--apply`: reemplazo explícito; el manifiesto dice qué es de cada uno | Para saber si el arnés está al día |
| `CHECKPOINTS.md`           | Criterios objetivos de "estado final correcto"                           | Para auto-evaluarte               |
| `.harness/harness.mjs`     | Motor agnóstico (lee la config y ejecuta tus comandos)                    | Si depuras el arnés               |
| `.harness/agents-block.md` | Fuente del bloque gestionado del final de este `AGENTS.md` (`harness-upgrade` lo reemplaza en los derivados) | Para cambiar ese bloque |
| `.claude/agents/`          | 3 de nivel y 3 especialistas opt-in                                       | Si delegas                  |
| `examples/`                | Arneses completos y ejecutables (Python y Node/JS) de referencia          | Para ver el método en acción      |
| `src/` · `tests/`          | Código de la aplicación y sus tests                                       | Para implementar / verificar      |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.**
- **No declares `done`** sin tests verdes **y** umbral de mutación superado
  (`bin/harness test` y `bin/harness mutate`).
- **No saltes la puerta humana:** plan aprobado antes de implementar y diff
  revisado en local antes de cualquier `git push` (ver «Política de trabajo»).
- **Un test por criterio**; TDD estricto (un test a la vez, `docs/tdd.md`) en
  nivel crítico.
- **Documenta** en `progress/current.md` mientras trabajas.
- **Deja el repo limpio** antes de cerrar (sin logs de debug, sin TODOs sin
  contexto).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.

## 4. Flujo de trabajo

Lo fija la «Política de trabajo» del final de este fichero: nivel de la tarea,
plan aprobado, ejecución delegada por capacidad y diff revisado en local. El
pipeline por fases con agentes propios (`docs/workflow.md`) está retirado.

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

<!-- harness:begin — bloque gestionado por la plantilla: no lo edites aquí; lo reemplaza scripts/harness-upgrade.mjs al aplicar -->
## Arnés SSD (gestionado por la plantilla)

- Entorno y arnés: `bin/harness init` · tests: `bin/harness test` · mutación: `bin/harness mutate [target]`.
- ¿Al día con la plantilla? `node scripts/harness-upgrade.mjs --check` (solo lectura); `--diff` enseña los cambios.
- Qué es de la plantilla y qué del proyecto: `harness.manifest.json`.

### Política de trabajo

**Niveles.** El planificador clasifica cada tarea por juicio (las pistas no son exhaustivas; ante la duda, el nivel superior) y escribe el nivel y su motivo en el plan; la persona lo corrige al aprobarlo.
- **trivial:** cambio local y evidente. Un solo contexto, sin subagentes obligatorios.
- **pequeño:** acotado a pocos ficheros y sin decisiones de diseño. Se planifica con `frontier` y se implementa con `balanced`, en la misma sesión.
- **estándar:** varias piezas o un comportamiento nuevo. Mismo mecanismo; el plan fija los artefactos que exige.
- **crítico:** seguridad, datos, dinero o un contrato público. El planificador sigue como orquestador y revisor: delega, puede reasignar y revisa.

**Puerta humana (dos puntos, todos los niveles).** 1) La persona aprueba el plan antes de implementar (en trivial basta uno de 1-2 líneas con el nivel y el motivo). 2) La persona revisa el diff en local antes de cualquier `git push`; un agente interactivo no empuja sin esa revisión.

**Delegación.** Por capacidad, no por proveedor: `frontier` (planificar, revisar, lo crítico), `balanced` (implementar), `fast` (tareas mecánicas y exploración). Salvo en trivial, el plan lleva una tabla «Delegación»: ejecutor, nivel, esfuerzo, motivo, «escalar si…» y verificación automática. Qué modelo es cada nivel en cada herramienta: `docs/modelos.md`.

**Issues y PR.** Plantillas en `.github/`. El issue de tarea (objetivo, nivel, criterios Given/When/Then, plan en casillas, resultados) es opcional mientras el proyecto conserve `feature_list.json`; el PR lleva siempre cuatro bloques (qué, por qué, cómo se probó, pendiente), «Impacto en tareas anteriores» y la casilla de revisión local, y el workflow «Plantilla del PR» lo comprueba (`node .harness/pr-body.mjs`).
<!-- harness:end -->
