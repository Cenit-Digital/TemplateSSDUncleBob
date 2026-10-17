# Memoria organizacional — patrones validados entre proyectos

> Cada repo aprende por su cuenta (issues y PR). La memoria organizacional hace
> que lo aprendido **cruce de un proyecto a los demás**: patrones ya validados,
> sincronizados al arrancar cada sesión (paso **2bis** del Protocolo de arranque
> de `CLAUDE.md`).
>
> **Estado: en pausa.** El bot que la alimenta tiene su cron retirado; los
> patrones ya validados siguen disponibles.

## De dónde sale la memoria

Vive en `Cenit-Digital/SistemaDeMemoriaUncleBob` — repo **privado** a
propósito, porque destila conocimiento de proyectos de cliente reales. Un bot
diario (mismo linaje que el de `docs/autonomous.md`) descubría por la API
todos los repos de la organización — los actuales y cualquiera futuro, sin
listas que mantener —, leía su `progress/history.md` y `CHECKPOINTS.md`, y
proponía como Pull Request **1-2 patrones máximo** con origen verificable.
Nada entra en la memoria sin revisión y fusión humanas; cero patrones
inventados es la regla número uno de su mandato
(`SistemaDeMemoriaUncleBob/.github/MEMORIA-AUTONOMA.md`).

## Cómo se consume (el paso 2bis)

Al recibir la primera tarea de una sesión:

```bash
scripts/sync-memoria.sh        # POSIX / macOS / Linux
pwsh scripts/sync-memoria.ps1  # Windows
```

El script clona la memoria en `.memoria-cache/` (ignorada por git; se
regenera en cada sesión). Si `.memoria-cache/patterns/<categoria>/` tiene
patrones de la categoría relevante a tu tarea (`responsive`, `tokens`,
`animacion`, `testing`, `arquitectura`, `tooling`), revísalos **antes** de
diseñar desde cero — pero no los apliques a ciegas: cada patrón lleva una
sección "Cuándo NO aplica" que se lee primero.

**El paso es NO bloqueante por diseño.** Sin red, sin `gh`, o sin acceso al
repo privado (por ejemplo, si usas esta plantilla pública desde fuera de
Cénit Digital), el script avisa, termina en 0 y la sesión sigue exactamente
igual. La memoria es una ventaja, nunca un punto único de fallo. Si no la
quieres en tu proyecto, borra los dos scripts y el paso 2bis de `CLAUDE.md` —
nada más depende de ellos.

## El camino de vuelta (en pausa)

El bot destilaba el `progress/history.md` y el `CHECKPOINTS.md` de cada repo. La
plantilla ya no exige `progress/*`, así que mientras el bot siga en pausa no
entra nada nuevo en la memoria; lo ya validado sigue disponible. Su futuro está
por decidir.

## Esquema de un patrón (resumen)

Cada patrón es un Markdown con `Origen` (repo + feature + fecha, verificable),
`Validado en` (la lista de repos donde ya funcionó — su señal de confianza),
`Categoría`, y cuatro secciones: el problema, el patrón, por qué esta
alternativa y cuándo NO aplica. El esquema completo y sus reglas:
`SistemaDeMemoriaUncleBob/patterns/README.md`.
