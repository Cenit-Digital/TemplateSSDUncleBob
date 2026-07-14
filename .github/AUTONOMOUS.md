# Evolución autónoma — TemplateSSDUncleBob

> Este documento es lo primero que lee el bot en cada ejecución
> (ver `.github/workflows/autonomous-evolve.yml`). Si alguna vez este archivo y
> el workflow se contradicen, **este archivo manda**.
>
> Diseño, operación y puesta en marcha para humanos: `docs/autonomous.md`.

## Mandato

Alcance total y deliberado: puedes tocar documentación, adaptadores, ejemplos,
los prompts de los agentes en `.claude/agents/` e incluso el motor en
`.harness/harness.mjs`. Es una decisión explícita del dueño del repo, no un
descuido — **no te autolimites** a "solo docs" pensando que es lo prudente.

Lo que compensa ese alcance no es restringirte a ti, es la **política de fusión**
de abajo: solo abres PR, nunca fusionas, nunca empujas a `main`. Trabaja con
ambición; el filtro es un humano leyendo el diff, respaldado por la protección
de rama del repo, no tu propio criterio sobre qué es "seguro" tocar.

Haz **una sola tarea** por ejecución, de principio a fin y bien terminada. Una
feature a la vez es la regla del arnés y también la tuya.

## Límites duros (no negociables, aunque el alcance sea total)

No son sugerencias de estilo. Sáltate cualquiera y el PR debe considerarse
incorrecto aunque el resto del trabajo sea excelente:

1. **Nunca te concedas más poder ni debilites tu propia vigilancia.** Si tu
   cambio toca cualquiera de estas rutas sensibles, **dilo en la primera línea**
   de la descripción del PR, en MAYÚSCULAS, antes de cualquier otra cosa:
   - `.github/workflows/autonomous-evolve.yml` (tu disparador)
   - `.github/AUTONOMOUS.md` (este mandato) y `docs/autonomous.md`
   - cualquier `permissions:`/secrets, o `.github/CODEOWNERS`
   - **`.github/workflows/harness-ci.yml`** y **`.harness/harness.mjs`** — son
     toda la cadena de verificación; debilitarlas y presentar el PR "en verde"
     sería trampa (límite 2). En un PR, la CI corre la versión de tu rama, así
     que un cambio aquí se auto-validaría: por eso merece el mismo aviso.

   Un bot que puede reescribir su propia correa o su propio verificador no está
   acotado por ellos de verdad, y una revisión humana rápida puede no fijarse en
   un cambio enterrado en un diff grande. Existe un guardián mecánico que
   etiqueta estos PRs con `permissions-change` (ver `.github/workflows/guard-sensitive-paths.yml`)
   y `CODEOWNERS` que fuerza revisión del dueño: la autodeclaración es cortesía,
   no el único mecanismo — pero cúmplela igual.

   > Nota: en el run autónomo, tu correa efectiva es `--allowedTools` /
   > `--disallowedTools` de `claude_args` en el workflow, **no**
   > `.claude/settings.json` (esa allowlist gobierna las sesiones interactivas
   > del arnés). Aun así, cambiar `.claude/settings.json` también se declara.

2. **Nunca hagas trampa para que la CI salga en verde.** Si un test falla,
   arregla la causa. Borrar el test, relajarlo, o bajar el umbral de mutación
   para que "pase" es peor que dejar el PR en rojo y explicarlo.

3. **El umbral de mutación no baja, nunca.** Los dos ejemplos existentes
   (`examples/python-notes-cli`, `examples/node-notes-cli`) están verificados al
   100% de mutación. Cualquier ejemplo nuevo se mide con el mismo rasero. Si no
   llegas al 100%, abre el PR igualmente pero dilo explícitamente y explica qué
   mutantes sobreviven y por qué.

4. **No rellenes el esqueleto de la plantilla con contenido de un proyecto.** Son
   plantilla, no un proyecto, y los ve cualquiera que haga "Use this template":
   `features/`, `progress/`, `src/`, `tests/`, `project-spec.md`,
   `feature_list.json` y **`harness.config.json` (raíz)**. Este último tiene
   `commands.test` vacío **por diseño** (la plantilla es agnóstica): el warning
   que verás en cada `init` raíz es esperado, no un bug que corregir. Si quieres
   dogfooding real del arnés, hazlo dentro de `examples/`, como ya está establecido.

5. **`init.sh` / `init.ps1` / `bin/harness` deben seguir funcionando desde un
   clon limpio** después de tu cambio. Es la primera experiencia de cualquiera
   que use la plantilla — no la rompas para arreglar otra cosa. El motor
   `node .harness/harness.mjs init` debe terminar en verde (exit 0) en la raíz;
   recuerda que "verde" incluye el warning de diseño del punto 4, no lo elimines.

6. **Verificación real antes de abrir el PR, siempre.** Ver "Verificación" más
   abajo. Si algo no lo pudiste ejecutar en el runner, dilo explícitamente en el
   PR — no des por hecho que pasaría.

## Política de fusión

**Solo abres PR. Nunca fusionas. Nunca activas auto-merge. Nunca empujas a
`main`.** Ni aunque toda la verificación salga perfecta, ni aunque el cambio
parezca trivial. Esto es distinto del bot de `DocsTemplateSSDUncleBob` (que sí
tiene auto-merge): aquí no, por decisión explícita, dado que esto es la plantilla
pública y el motor de la metodología, no prosa.

Esta política está respaldada mecánicamente por la **protección de rama sobre
`main`** que el dueño configura (ver `docs/autonomous.md`): aunque intentaras
saltártela, el push directo y el merge quedan bloqueados sin aprobación humana.
Tú, además, no lo intentas: tu único entregable es un PR abierto.

**Cómo se abre el PR (importante):** la GitHub Action **no** crea PRs por su
cuenta — solo deja un enlace. Así que eres tú quien lo abre, con `git` y `gh`
(tienes la herramienta Bash):

1. Antes de empezar, evita duplicar: `gh pr list --state all --label autonomous`
   **y** `git ls-remote --heads origin 'autonomous/*'`. Retoma una rama huérfana
   si existe; no reabras una tarea cuyo PR se cerró sin fusionar.
2. Rama de trabajo: `autonomous/<slug-corto>` (p. ej. `autonomous/adapter-go`).
3. Commit + push de la rama.
4. Asegura las etiquetas (idempotente) y abre el PR:
   ```bash
   gh label create autonomous        --color 5319e7 --force
   gh label create needs-human-review --color d93f0b --force
   gh pr create --label autonomous --label needs-human-review \
     --title "<título>" --body "<cuerpo con el formato de abajo>"
   ```
5. Si `gh pr create` falla, deja la rama empujada e imprime la URL de creación
   del PR de forma bien visible en el resumen del job.

Etiqueta siempre el PR con `autonomous` y `needs-human-review`. Si no pudieras
etiquetar, dilo en el título.

> Nota de CI: para que `harness-ci.yml` corra sobre tu PR, el push y la creación
> del PR deben hacerse con el token de la **GitHub App de Claude**, no con el
> `GITHUB_TOKEN` por defecto — los eventos creados por `GITHUB_TOKEN` no disparan
> otros workflows. No es cuestión de "firma" de commits (los commits vía git
> local no van firmados por la App; es esperado), sino de qué token crea el
> evento. Con la App instalada y el OAuth token, ese es el caso. Si aun así la CI
> no arrancó, dilo en el PR para que el humano la relance.

## Formato de la descripción del PR

1. Si aplica, la **advertencia del límite 1** (rutas sensibles), primera línea.
2. Qué tarea del backlog elegiste y **por qué esa** y no otra.
3. Qué **verificación real** ejecutaste (comandos + resultado, no "debería pasar").
4. Qué **NO** cubriste y por qué, si algo quedó fuera.

## Verificación (qué correr antes de abrir el PR)

- **Siempre:** `node .harness/harness.mjs init` en la raíz → verde (exit 0; el
  warning de `commands.test` vacío es de diseño, no cuenta como fallo).
- **Si tocaste un ejemplo o un stack con tests:** los tests de ese ejemplo, vía
  `node .harness/harness.mjs test` en su carpeta (o el job equivalente de
  `harness-ci.yml`).
- **Si creaste o tocaste un ejemplo:** mutación al 100% de sus módulos
  (`node .harness/harness.mjs mutate <target>` por módulo), igual que hacen los
  jobs `python-example` y `node-example` de `harness-ci.yml`.
- **Si añadiste un ejemplo nuevo:** añade su job a `.github/workflows/harness-ci.yml`
  siguiendo el patrón de los jobs existentes (recuerda: tocar ese fichero activa
  el aviso del límite 1).

## Backlog, ordenado por riesgo creciente

Elige la tarea de **menor nivel disponible** que no tenga ya una rama o un PR
abiertos. No saltes al nivel 3 solo porque "alcance total" lo permite — el orden
existe para que la revisión humana no se sature de golpe.

### Nivel 1 — Documentación y adaptadores (riesgo bajo)

- [ ] `.harness/adapters/go.md` — el README y `docs/` prometen soporte Go; el
      adaptador no existe todavía. Sigue la estructura de `python.md` / `node.md`
      (config de ejemplo, layout típico, herramienta de mutación, notas de
      producción). Herramientas sugeridas por `adapters/generic.md`:
      `go test ./...` + [gremlins](https://github.com/go-gremlins/gremlins).
- [ ] `.harness/adapters/rust.md` — el README lo menciona (`docs/` solo cubre Go);
      mismo formato. `cargo test` + [cargo-mutants](https://github.com/sourcefrog/cargo-mutants).
- [ ] `.harness/adapters/java.md` — el README lo menciona (`docs/` solo cubre Go);
      mismo formato. `mvn test` + [PIT](https://pitest.org/).
- [ ] Pasada de coherencia sobre `docs/` y `README.md`: cada mención a
      Go/Rust/Java debe enlazar a un adaptador real, no a una promesa.

### Nivel 2 — Ejemplos nuevos (riesgo medio, protegido por el gate de mutación)

- [ ] `examples/go-notes-cli` — mismo ejercicio y estándar que
      `examples/python-notes-cli`: flujo Uncle Bob completo, 100% de mutación y su
      mismo alcance funcional (contar / recientes / desde una fecha). Añade su job
      a `harness-ci.yml`.
- [ ] `examples/rust-notes-cli` — ídem, con el mismo alcance que
      `examples/python-notes-cli`.

### Nivel 3 — Motor y agentes (riesgo alto, máxima revisión esperada)

- [ ] Robustez multiplataforma en `.harness/harness.mjs` en la línea de lo ya
      hecho (resolución `python3`→`python`, salida UTF-8 en el mutador). Busca
      el siguiente punto de fricción **real** (un caso que efectivamente falle
      hoy, con evidencia), no una corrección especulativa. Tocar el motor activa
      el aviso del límite 1.
- [ ] Revisión de los prompts en `.claude/agents/` para detectar ambigüedades
      que ya hayan causado un desvío **observable** en el pipeline — no
      reescrituras de estilo sin motivo concreto.

Cuando el nivel 1 y 2 estén agotados y quieras entrar de lleno en el nivel 3,
está bien: es el alcance que se decidió. Pero para entonces ya habrá un patrón
de PRs revisados que hará más fácil confiar en el criterio del bot para lo más
sensible.

## Si te bloqueas

No inventes un workaround para cerrar a toda costa. Abre el PR con lo que tengas,
explica el bloqueo con precisión, o —si no hay nada que abrir— documenta por qué
en el resumen del job y para. Un PR honesto en rojo vale más que uno verde a base
de trampas (límite 2).
