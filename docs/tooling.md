# Tooling — agentes y hooks

> Refuerzan el arnés, no lo reemplazan. Los agentes de nivel ejecutan y revisan lo que delega el plan; los especialistas son **opcionales y de solo lectura**: los convoca el planificador cuando aportan valor y no sustituyen a la revisión del cambio.

## Agentes de nivel (`.claude/agents/`)

La política de niveles está en `AGENTS.md`; el modelo de cada uno, en `docs/modelos.md`.

| Agente              | Nivel     | Para qué                                                   |
| ------------------- | --------- | ---------------------------------------------------------- |
| `worker_fast`       | fast      | Tareas mecánicas y de exploración con salida comprobable   |
| `worker_balanced`   | balanced  | Implementa lo que el plan delega, con un test por criterio |
| `reviewer_frontier` | frontier  | Revisión independiente, solo lectura                       |

Sirven para todo el repositorio, `src/` y sus tests incluidos.

## Especialistas (opt-in, solo lectura)

| Agente              | Cuándo usarlo                                                        | Qué devuelve                      |
| ------------------- | -------------------------------------------------------------------- | --------------------------------- |
| `security_reviewer` | Cambios que tocan entrada de usuario, auth, IO, red o terceros       | Veredicto por severidad           |
| `a11y_seo_auditor`  | Features con UI web (accesibilidad y SEO)                            | Veredicto por impacto             |
| `mentor`            | Cuando la persona quiere una explicación didáctica de un cambio      | Responde en el chat, no bloquea   |

Revisan y reportan; no editan `src/`. Bórralos si tu proyecto no los necesita (p. ej. `a11y_seo_auditor` sin UI web).

## Hooks (`.claude/settings.json`)

Dos verificaciones que **ejecuta el arnés, no el agente**, así que no se pueden saltar:

- **PostToolUse (Edit|Write)** → corre `node .harness/harness.mjs test` y muestra el resumen: feedback inmediato tras cada cambio de código.
- **Stop** → corre `node .harness/harness.mjs init` cuando el agente termina de responder y avisa si algo quedó rojo.

Usan el motor agnóstico: los comandos concretos salen de `harness.config.json`.

## Permisos y modelo

`.claude/settings.json` incluye una allowlist mínima (`bin/harness …`, `node .harness/harness.mjs …`) para que los comandos del arnés no pidan confirmación en cada invocación; amplíala con los de tu stack. También fija `model: opusplan` (ver `docs/modelos.md`).
