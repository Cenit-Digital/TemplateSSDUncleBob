# Modelos por nivel de capacidad (capa 1)

> Consultado el **2026-10-17**. La política (capa 0) está en `AGENTS.md` y no nombra modelos: aquí está
> la única tabla que sí lo hace. Los alias y las versiones cambian; actualiza esta tabla **en la
> plantilla** (con fecha y fuente), no en cada proyecto.
>
> Procedencia: **[R]** leído en la documentación oficial (URL en *Fuentes*) · **[D]** propuesta del
> arnés, no un dato · **sin verificar** = no hay dato fiable y no se inventa uno.

| Herramienta | Dónde se fija el modelo [R] | `frontier` | `balanced` | `fast` |
| --- | --- | --- | --- | --- |
| Claude Code | `model` en `.claude/settings.json`; `model:` en el agente (alias, ID completo o `inherit`); `/model`. `opusplan`: plan con `opus`, ejecución con `sonnet` | `opus` [D]; `best` si quieres el más capaz de tu cuenta (cae a `opus` si no hay `fable`) [R] | `sonnet` [D] | `haiku` [D] |
| Codex | `model` y `model_reasoning_effort` en su configuración | sin verificar | sin verificar | sin verificar |
| Copilot (VS Code) | `model` en el `.agent.md` (nombre o lista priorizada) y en cada `handoff` (`Nombre (vendor)`) | sin verificar | sin verificar | sin verificar |
| OpenCode | `model` por agente, formato `proveedor/modelo` (`opencode.json` o frontmatter); agentes Plan y Build | sin verificar | sin verificar | sin verificar |
| Gemini CLI | Solo compatibilidad mínima: `GEMINI.md` importa `AGENTS.md`; no se asignan niveles | — | — | — |

Notas [R]: los alias de Claude Code resuelven en la API de Anthropic a Opus 5.5 (`opus`), Sonnet 5.5
(`sonnet`) y Haiku 5.5 (`haiku`); en otras plataformas pueden ser otra versión. En las páginas de
Codex, Copilot y OpenCode consultadas el 2026-10-17 aparecen ejemplos de nombres de modelo y ninguna
recomendación por nivel de capacidad: elige la persona, y esa elección se registra aquí cuando se verifique.

## Fuentes

- Claude Code: modelos y `opusplan` https://code.claude.com/docs/en/model-config · agentes https://code.claude.com/docs/en/subagents
- Codex: https://learn.chatgpt.com/docs/config-file/config-reference
- VS Code Copilot: https://code.visualstudio.com/docs/agent-customization/custom-agents
- OpenCode: https://opencode.ai/docs/agents/
- Gemini CLI: https://geminicli.com/docs/cli/gemini-md
