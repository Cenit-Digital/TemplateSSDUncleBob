# TemplateSSDUncleBob — Arnés SDD estilo Uncle Bob (agnóstico al lenguaje)

Plantilla **reutilizable para cualquier proyecto** que aplica el flujo de
desarrollo con IA de **Robert C. Martin (Uncle Bob)**, popularizado por
[BettaTech](https://github.com/betta-tech/harness-sdd):

> **conversar la spec → destilarla en Gherkin → tallar con TDD estricto →
> podar con juicio (review) → validar con prueba de mutación.**

Lo importante no es la app: es **cómo se estructura el trabajo para que un
agente de IA desarrolle de forma autónoma y verificable**, con una sola puerta
de aprobación humana en el punto de máximo apalancamiento (el contrato Gherkin).

> 📚 Documentación viva y ampliada: **https://cenit-digital.github.io/DocsTemplateSSDUncleBob/**

## Qué la hace distinta: es agnóstica al lenguaje

El proceso, los agentes y las puertas son **fijos**. Lo único que cambia por
proyecto son los comandos de tu stack, declarados en un `harness.config.json`:

```json
{
  "commands": {
    "test":   "…tu comando de tests…",
    "mutate": "…tu prueba de mutación…"
  },
  "mutation": { "threshold": 0.8 }
}
```

Un motor de **cero dependencias** (`.harness/harness.mjs`, solo Node ≥ 18) lee
esa config y ejecuta tus comandos. Así el mismo arnés sirve para Python,
Node/TS, Go, Rust, Java… Ver `docs/configuration.md` y `.harness/adapters/`.

## El pipeline

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

Una sola feature a la vez. Estado en disco (no en el chat): `project-spec.md`,
`features/`, `progress/` sobreviven a reinicios y ventanas de contexto.

## Arranque rápido

### Usar como plantilla

1. En GitHub, pulsa **«Use this template»** (o clona el repo).
2. Requisito único del arnés: **Node.js ≥ 18** (para el motor). Tu proyecto
   usa el runtime que quieras.
3. Edita `harness.config.json` con los comandos de tu stack
   (ver `docs/configuration.md` o copia un ejemplo de `examples/`).
4. Verifica el entorno:

   ```bash
   ./init.sh                 # POSIX / macOS / Linux
   pwsh ./init.ps1           # Windows / PowerShell
   # o, en cualquier plataforma:
   node .harness/harness.mjs init
   ```

5. Abre Claude Code en la raíz: `CLAUDE.md` fuerza el rol `craftsman_lead`
   (orquesta, no teclea). Pide: **«implementa la siguiente feature pendiente»**.

### Comandos del arnés

| Comando                    | Qué hace                                            |
| -------------------------- | --------------------------------------------------- |
| `bin/harness init`         | Verifica entorno, ficheros base, feature_list, tests |
| `bin/harness test`         | La suite de tests declarada                          |
| `bin/harness mutate [t]`   | La prueba de mutación                                |
| `bin/harness verify`       | init + mutación (puerta de cierre)                  |
| `bin/harness status`       | Resumen de `feature_list.json`                      |

(En Windows: `bin\harness.ps1 <comando>`.)

## Ejemplos ejecutables (verificados al 100%)

Dos arneses completos, listos para inspeccionar o copiar como punto de partida:

| Ejemplo                     | Stack                    | Tests | Mutación |
| --------------------------- | ------------------------ | ----- | -------- |
| `examples/python-notes-cli` | Python (stdlib)          | 47    | 100%     |
| `examples/node-notes-cli`   | Node/JS (cero deps)      | 29    | 100%     |

Ambos demuestran el flujo Uncle Bob de punta a punta con un mutador propio sin
dependencias. Para producción en TS, el adaptador Node usa Vitest + StrykerJS.

## Los agentes (`.claude/agents/`)

**Pipeline (6):** `craftsman_lead` (orquesta, no implementa), `spec_partner`
(debate la spec), `gherkin_author` (destila el contrato), `tdd_craftsman`
(Rojo-Verde-Refactor), `judge` (poda) y `mutation_tester` (mide que los tests
muerden).

**Apoyo, opcionales (3):** `security_reviewer`, `a11y_seo_auditor` (UI web) y
`mentor`. Bórralos si tu proyecto no los necesita.

## Estructura

```
.
├── CLAUDE.md · AGENTS.md · CHECKPOINTS.md   # gobernanza del arnés
├── harness.config.json · harness.schema.json # ⭐ el punto agnóstico
├── init.sh · init.ps1 · bin/harness(.ps1)    # lanzadores multiplataforma
├── scripts/sync-memoria.(sh|ps1)             # memoria organizacional (paso 2bis)
├── .harness/
│   ├── harness.mjs                           # motor agnóstico (cero deps)
│   └── adapters/                             # python.md · node.md · go.md · generic.md
├── docs/                                     # workflow · tdd · gherkin · mutation
│   │                                         #   architecture · conventions · verification
│   └── configuration · tooling · autonomous · memoria-organizacional
├── .claude/agents/                           # 6 del pipeline + 3 de apoyo
├── feature_list.json · project-spec.md       # alcance y spec
├── features/ · progress/ · src/ · tests/     # contrato, estado y código
├── examples/{python,node}-notes-cli/         # arneses completos de referencia
└── .github/
    ├── workflows/harness-ci.yml              # CI: init + mutación de los ejemplos
    ├── workflows/autonomous-evolve.yml       # bot semanal de auto-mejora (solo PR)
    ├── workflows/guard-sensitive-paths.yml   # marca PRs que tocan rutas sensibles
    ├── AUTONOMOUS.md                          # mandato del bot (ver docs/autonomous.md)
    └── CODEOWNERS                             # revisión obligatoria del dueño (sensibles)
```

## Evolución autónoma (opcional)

Un workflow programado puede mejorar el propio arnés de forma acotada: una vez
por semana elige una tarea de un backlog, la completa con verificación real y
**abre un Pull Request que un humano revisa y fusiona a mano** (nunca auto-merge).

- Disparador: `.github/workflows/autonomous-evolve.yml`
- Mandato y límites duros: `.github/AUTONOMOUS.md`
- Guardián + propietarios: `.github/workflows/guard-sensitive-paths.yml` · `.github/CODEOWNERS`
- Puesta en marcha, coste y **protección de rama obligatoria**: **`docs/autonomous.md`**

La política "solo abre PR" se respalda mecánicamente con protección de rama sobre
`main` (paso obligatorio de la checklist en `docs/autonomous.md`). Solo corre en el
repositorio canónico; quien use la plantilla opta explícitamente con la variable de
repo `ENABLE_AUTONOMOUS_EVOLVE=true`, o borra esos ficheros si no lo quiere.

## Memoria organizacional (opcional)

Los proyectos de Cénit Digital comparten patrones ya validados a través de un
repo privado de memoria (`SistemaDeMemoriaUncleBob`). Esta plantilla nace
conectada: el paso 2bis del Protocolo de arranque (`CLAUDE.md`) sincroniza esos
patrones en `.memoria-cache/` con `scripts/sync-memoria.(sh|ps1)` y los consulta
antes de diseñar desde cero. El paso es **no bloqueante**: sin acceso a ese repo
(p. ej. usando la plantilla desde fuera de la organización), el arranque sigue
exactamente igual — y puedes borrar los dos scripts y el paso 2bis si no lo
quieres. Detalles: `docs/memoria-organizacional.md`.

## Créditos

Método de **Robert C. Martin (Uncle Bob)**, destilado por **BettaTech**
([playlist](https://www.youtube.com/playlist?list=PLJkcleqxxobX8POJ0sMoG62VyyZGrvhM2),
[repo](https://github.com/betta-tech/harness-sdd/tree/uncle-bob-harness)).
Generalización agnóstica y plantilla por **Cenit Digital**. Licencia MIT.
