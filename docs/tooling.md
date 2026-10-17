# Tooling — agentes y hooks

> Estos refuerzan el arnés, no lo reemplazan. Los agentes de nivel ejecutan y
> revisan lo que delega el plan; los especialistas son **opcionales y de solo
> lectura**: los convoca el planificador cuando aportan valor y no sustituyen a
> la revisión del cambio.

## Especialistas (`.claude/agents/`)

| Agente             | Cuándo usarlo                                             | Qué escribe                       |
| ------------------ | -------------------------------------------------------- | --------------------------------- |
| `security_reviewer`| Features que tocan entrada de usuario, auth, IO, red     | `progress/security_review.md`     |
| `a11y_seo_auditor` | Features con UI web (accesibilidad y SEO)                | `progress/audit_a11y_seo.md`      |
| `mentor`           | Cuando el humano quiere explicación didáctica de un cambio | Responde en chat (no bloquea)   |

Son **de solo lectura**: revisan y reportan, no editan `src/`. Bórralos si tu
proyecto no los necesita (p. ej. `a11y_seo_auditor` en un proyecto sin UI web).

## Agentes de nivel (`.claude/agents/`)

Ejecutores y revisor por capacidad, sin atarse a `feature_list.json` ni a `progress/` (la política de niveles
está en `AGENTS.md`; el modelo de cada uno, en `docs/modelos.md`):

| Agente              | Nivel     | Para qué                                                      |
| ------------------- | --------- | ------------------------------------------------------------- |
| `worker_fast`       | fast      | Tareas mecánicas y de exploración con salida comprobable      |
| `worker_balanced`   | balanced  | Implementa lo que el plan delega, con un test por criterio    |
| `reviewer_frontier` | frontier  | Revisión independiente, solo lectura                          |

`worker_balanced` y `worker_fast` sirven para todo el repositorio, `src/` y sus tests incluidos. El pipeline por
fases anterior está retirado.

## Hooks (`.claude/settings.json`)

El arnés automatiza dos verificaciones que **el harness ejecuta, no el
agente**, así que no se pueden saltar:

- **PostToolUse (Edit|Write)** → corre `bin/harness test` y muestra el
  resumen. Feedback inmediato tras cada cambio de código.
- **Stop** → corre `bin/harness init` antes de cerrar la sesión y avisa si
  algo quedó rojo.

Los hooks usan el motor agnóstico, así que funcionan igual en cualquier stack
(los comandos concretos salen de `harness.config.json`).

## Permisos

`.claude/settings.json` incluye una allowlist mínima para que los comandos del
arnés (`bin/harness …`, `node .harness/harness.mjs …`) no pidan confirmación
en cada invocación. Amplíala con los comandos de tu stack si lo necesitas.

## Extensiones opcionales del ecosistema

En proyectos reales (como la web corporativa que inspiró esta plantilla) el
arnés convive con herramientas del stack: skills de Claude Code gestionadas
con **autoskills** (`skills-lock.json`), un asistente tipo "senior perezoso"
para escribir lo mínimo que funciona, etc. No son parte del núcleo del arnés;
añádelas si tu equipo las usa.
