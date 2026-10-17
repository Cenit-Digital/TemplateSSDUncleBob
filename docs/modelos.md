# Modelos por nivel de capacidad (capa 1)

> Consultado el **2026-10-17**. La política (capa 0) está en `AGENTS.md` y no nombra modelos: aquí está
> la única tabla que sí lo hace. Los alias y las versiones cambian; actualiza esta tabla **en la
> plantilla** (con fecha y fuente), no en cada proyecto.
>
> Procedencia: **[R]** leído en la documentación oficial (URL en *Fuentes*) · **[D]** propuesta del
> arnés, no un dato · **sin verificar** = no hay dato fiable y no se inventa uno.

| Herramienta | Dónde se fija el modelo [R] | `frontier` | `balanced` | `fast` |
| --- | --- | --- | --- | --- |
| Claude Code | `model` en `.claude/settings.json` (aquí `opusplan`: plan con `opus`, ejecución con `sonnet`); `model:` en el agente (alias, ID completo o `inherit`); `/model` | `opus` [D]; `best` si quieres el más capaz de tu cuenta (cae a `opus` si no hay `fable`) [R] | `sonnet` [D] | `haiku` [D] |
| Codex | `model` y `model_reasoning_effort` en su configuración | sin verificar | sin verificar | sin verificar |
| Copilot (VS Code) | `model` en el `.agent.md` (nombre o lista priorizada) y en cada `handoff` (`Nombre (vendor)`) | sin verificar | sin verificar | sin verificar |
| OpenCode | `model` por agente, formato `proveedor/modelo` (`opencode.json` o frontmatter); agentes Plan y Build | sin verificar | sin verificar | sin verificar |
| Gemini CLI | Solo compatibilidad mínima: `GEMINI.md` importa `AGENTS.md`; no se asignan niveles | — | — | — |

Notas [R]: los alias de Claude Code resuelven en la API de Anthropic a Opus 5.5 (`opus`), Sonnet 5.5
(`sonnet`) y Haiku 5.5 (`haiku`); en otras plataformas pueden ser otra versión. En las páginas de
Codex, Copilot y OpenCode consultadas el 2026-10-17 aparecen ejemplos de nombres de modelo y ninguna
recomendación por nivel de capacidad: elige la persona, y esa elección se registra aquí cuando se verifique.

## Agentes de Claude Code

Cada agente de `.claude/agents/` fija su propio modelo, que manda sobre el de la sesión (orden: parámetro
de la llamada, `model:` del agente, `CLAUDE_CODE_SUBAGENT_MODEL`, modelo de la sesión) [R]. La asignación de
nivel a alias es [D]:

| Agente | Modelo | Para qué |
| --- | --- | --- |
| `worker_fast` | `haiku` | tareas mecánicas y exploración |
| `worker_balanced` | `sonnet` | implementar lo que el plan delega |
| `reviewer_frontier` | `opus` | revisión independiente, solo lectura |
| `security_reviewer` | `opus` | fronteras de confianza (opcional) |
| `a11y_seo_auditor` | `sonnet` | accesibilidad y SEO (opcional) |
| `mentor` | `sonnet` | explicar el porqué (opcional) |

## Nivel crítico en Claude Code

Con `opusplan` la sesión corre en `sonnet` fuera del modo plan. En crítico, cambia la sesión a `opus`
(`/model opus`): el planificador orquesta y delega en `worker_balanced` y `worker_fast`, que conservan su
propio modelo, y `reviewer_frontier` hace la revisión independiente.

El `model` de `.claude/settings.json` se reaplica en cada arranque aunque elijas otro con `/model` [R]; para
anularlo de forma persistente ponlo en `.claude/settings.local.json`, que tiene precedencia [R]. La
documentación indica que `opusplan[1m]` se puede fijar con el ajuste `model`; que `opusplan` a secas sea
válido ahí se infiere de eso: comprueba con `/model` en una sesión nueva.

## Fuentes

- Claude Code: modelos y `opusplan` https://code.claude.com/docs/en/model-config · agentes https://code.claude.com/docs/en/subagents · ajustes y precedencia https://code.claude.com/docs/en/settings
- Codex: https://learn.chatgpt.com/docs/config-file/config-reference
- VS Code Copilot: https://code.visualstudio.com/docs/agent-customization/custom-agents
- OpenCode: https://opencode.ai/docs/agents/
- Gemini CLI: https://geminicli.com/docs/cli/gemini-md
