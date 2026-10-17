# Instrucciones para Claude — Plantilla SSD "Uncle Bob"

> Este archivo se carga automáticamente al inicio de cada sesión.
> Plantilla **agnóstica al lenguaje**: lo único que cambia por proyecto son los
> comandos declarados en `harness.config.json` (ver `docs/configuration.md`).
>
> La política común a todas las herramientas (niveles, puerta humana, delegación)
> vive en `AGENTS.md`, importado aquí; este fichero solo añade el arranque propio
> de Claude Code.

@AGENTS.md

## Protocolo de arranque (al recibir la primera tarea)

1. Lee `AGENTS.md` para orientarte.
2. Lee el issue de la tarea (objetivo, criterios y plan), si lo hay.
2bis. Sincroniza la memoria organizacional: `scripts/sync-memoria.sh` (POSIX)
   o `pwsh scripts/sync-memoria.ps1` (Windows). Si `.memoria-cache/patterns/`
   tiene patrones de la categoría de tu tarea, revísalos **antes** de diseñar
   desde cero, respetando su "Cuándo NO aplica". Paso **no bloqueante**: si
   falla (sin red o sin acceso al repo privado), sigue sin memoria y déjalo
   anotado en el issue de la tarea o en el PR. Ver `docs/memoria-organizacional.md`.
3. Ejecuta `./init.sh` (POSIX) o `pwsh ./init.ps1` (Windows), o
   `bin/harness init`. Si falla, **paras** y reportas.

## Comandos del proyecto (a través del arnés)

Los comandos concretos de tu stack viven en `harness.config.json`. Se invocan
siempre a través del motor agnóstico (no los hardcodees):

- `bin/harness init` — verificación completa del entorno y el arnés.
- `bin/harness test` — la suite de tests.
- `bin/harness mutate [target]` — la prueba de mutación.
- `bin/harness verify` — init + mutación completa (solo antes de una entrega; el cierre ordinario es `init` + `test`).
- `bin/harness status` — resumen de `feature_list.json`, si el proyecto lo conserva.

En Windows usa `bin\harness.ps1 <comando>`.

## Agentes

En `.claude/agents/` hay agentes de nivel (`worker_fast`, `worker_balanced`,
`reviewer_frontier`) y especialistas opt-in de solo lectura (`security_reviewer`,
`a11y_seo_auditor`, `mentor`). Ver `docs/tooling.md` y `docs/modelos.md`.
