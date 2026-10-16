# ADR 0001 — Rediseño del arnés SSD: más barato, proporcional y propagable

- **Estado:** Propuesto (pasa a Aceptado al fusionar este PR). Fecha: 2026-10-16. Es el primer ADR del repo.
- **Alcance:** solo documenta decisiones. Nada de lo descrito aquí está implementado salvo la pausa de los bots (D11); cada cambio llegará en su propio PR pequeño.
- **Estado por decisión:** *decidido* y *aprobado* los fijó el titular del repo en una sesión de debate el 2026-10-16; *propuesto* sigue pendiente de su OK.
- **Procedencia de las cifras:** **[R]** re-verificada el 2026-10-16 contra el repo o la documentación oficial · **[M]** medida el 2026-10-16 con una agregación local sobre transcripciones de Claude Code (script no versionado, no reproducible desde este repo) · **[D]** derivada de leer las instrucciones, no medida · **[NV]** no verificada.

## Contexto

El titular declara que las tareas pequeñas consumen más de la mitad de su suscripción **[NV: dato declarado, no medido aquí]**. La plantilla adapta el método que divulga BettaTech (su README lo presenta como método de Robert C. Martin, "Uncle Bob", destilado por BettaTech). De Uncle Bob solo hay verificada una fuente primaria: su post del 12-feb-2026 (D1). El rediseño se apoya además en el vídeo "7 pasos para programar mejor con coding agents" (return(GiS), 27:32, 14-oct-2026), que se cumple al 100 % (matriz de trazabilidad, más abajo).

### Diagnóstico

| # | Hallazgo | Cifra | Proc. |
|---|---|---|---|
| 1 | Sin válvula de escape: una tarea trivial recorre spec → gherkin → pausa humana → TDD → juez → mutación (tabla "Escalado de esfuerzo" de `craftsman_lead.md`) | 6 fases | R |
| 2 | Ningún agente fija `model:`; los 9 heredan el de la sesión | 9 de 9 | R |
| 3 | Coste multiplicativo por diseño: contextos LLM y llamadas por cambio de una línea; lectura de 123,7 KB cuando lo único son 52,2 KB | ≥7 contextos, 33–87 llamadas, 2,37× | D |
| 4 | Bucles sin tope declarado: el superviviente de mutación vuelve a `tdd_craftsman` y de nuevo a `judge` (`mutation_tester.md`); el juez que rechaza, igual | sin tope | R |
| 5 | Los agentes del pipeline generan al menos el 17 % de toda la salida; Opus es el 70 % de la salida; ~445 K tokens de contexto por llamada en sesión principal; `effortLevel` global en `xhigh` | 659 transcripciones, 35.511 mensajes, jul–oct 2026 (octubre parcial; cota inferior) | M |
| 6 | Concentración: un repo derivado acumula 4,9 M de tokens de salida de pipeline (59 agentes); 10 `spec_partner` frente a 49 `tdd_craftsman` (compatible con reejecuciones; no probado) | — | M |
| 7 | Motor inflado: `harness.mjs` pasó de 314 a 898 líneas (873 al diagnosticar; el 56 % era validación defensiva, medido sobre las 873); `engine.test.mjs` 1356 líneas y ~87 tests que ningún workflow, `init` ni el motor ejecutan; 17 de 27 PRs del bot fueron endurecimiento de entradas malformadas | 314 → 898 | R (líneas, CI) · M (56 %, 17/27) |
| 8 | Bot autónomo con cron diario: al menos 92 ejecuciones `schedule` entre 2026-07-14 y 2026-10-15 en una muestra de 200 ejecuciones; unas 33 abrieron sesión real de pago (no reproducido hoy) | ≥92 | R · M |
| 9 | Repos derivados: de 36 ficheros de arnés comparados con `main`, tres tienen 30–33 idénticos; uno es antiguo (11 idénticos, 23 modificados); otro sigue otra línea evolutiva (0 idénticos). Dos cuentas de GitHub; el vínculo "template" de GitHub existe solo en 2 de 5. Copias locales, pueden tener cambios sin confirmar | 5 repos | M |

**No es el problema:** el contexto estático de arranque (~4,3 K tokens **[M]**). El coste es multiplicativo (contextos × turnos × modelo caro × bucles), así que recortar prompts rendiría poco. **Tesis:** el arnés es una parte del coste, no el todo; las palancas de usuario (modelo, esfuerzo, longitud de sesión, plugins globales) viven en `~/.claude` y quedan fuera de este repo (A3).

## Decisión

**D1. Fuentes y alcance (decidido).** El vídeo (7 pasos + Bonus) se cumple completo. De Uncle Bob se usa solo su post del 12-feb-2026, parafraseado: el desarrollo guiado por especificaciones aporta valor con IA pero arriesga volver al diseño grande por adelantado; hay que conservar el carácter iterativo con specs justas para las historias del sprint, como QA escribía solo las pruebas de aceptación del sprint; las specs se irán modificando; las coescriben persona e IA y la aprobación final es humana. Nada más se le atribuye.

**D2. Ritmo (decidido).** Un incremento = un PR pequeño (≲ 250 líneas de diff), un tema, reversible; no se empieza el siguiente hasta que el titular lo revise y fusione; los cambios van primero a un repo piloto; nada fuera de este repo (otros repos, `~/.claude`, ajustes de GitHub) sin OK explícito; cada incremento termina con una nota de despliegue.

**D3. Seguimiento y especificación (decidido, opción b).** Un issue por tarea (objetivo, plan en casillas, etiquetas, criterios) sustituye a `feature_list.json` y a `progress/*`; el PR enlaza el issue. Gherkin deja de ser un paso fijo con agente propio: los criterios de aceptación se escriben en Given/When/Then dentro del issue (los leen personas no técnicas, que sí acceden a GitHub). Hay **una spec viva por capacidad** que el mismo PR actualiza en su diff, así no deriva por construcción. Desaparecen `gherkin_author` por tarea y la puerta intermedia sobre `.feature`.

**D4. Puerta humana (decidido).** Dos puntos: aprobar el plan antes de implementar, y revisar en local el diff antes de cualquier push. Se elimina la aprobación del `.feature` como paso fijo; al titular le interesa ver qué se implementa y los casos, y eso lo cubren el plan y la spec viva.

**D5. Niveles (decidido).** Cuatro niveles por tamaño y riesgo: trivial, pequeño, estándar y crítico, clasificados por el planificador en el plan. Meta del nivel trivial: un solo contexto, cero subagentes obligatorios, sin `progress/*`. Los criterios exactos de clasificación están abiertos (A6).

**D6. TDD y mutación proporcionales (decidido; el cuándo, propuesto).** TDD estricto solo en crítico; en los demás, un test por criterio, y en un bugfix el test de regresión va primero. `tdd_craftsman` y `mutation_tester` dejan de ser agentes por defecto: la mutación pasa a ser `bin/harness mutate`, una puerta determinista sin LLM, solo en crítico. Umbral **0,8 por defecto** (el valor actual de `harness.config.json` **[R]**) y 1,0 solo por excepción justificada y registrada; los supervivientes tienen tope de 2 iteraciones. Hoy dos derivados usan 1,0 y dos usan 0,8 **[M]**. Propuesto: correr sobre los módulos tocados en cada tarea crítica y la mutación completa solo antes de una entrega. Si el TDD en sesión principal basta se validará en la prueba A/B de coste (A7).

**D7. Modelos por rol, neutrales entre proveedores (aprobado).** El arnés no se ata a un proveedor; las herramientas objetivo son las que nombra el vídeo (GitHub Copilot en IDE y CLI, Codex, Claude Code y OpenCode; Gemini solo con compatibilidad mínima: un `GEMINI.md` que importe `AGENTS.md`). Tres capas: **(0)** política neutra en `AGENTS.md` por niveles de capacidad (frontier / balanced / fast), sin nombres de modelo; **(1)** una tabla única de mapeo nivel → modelo por herramienta, con fecha y fuente; **(2)** adaptadores finos opt-in por herramienta. Con esa política, el modelo que planifica recomienda en el plan una tabla "Delegación": ejecutor, nivel, esfuerzo, motivo, "escalar si" y verificación automática.

**D8. Delegación híbrida por nivel (decidido).** Pequeño y estándar: `opusplan` en la misma sesión (Opus planifica, Sonnet implementa **[R]**). Crítico: el planificador sigue como orquestador y revisor, delega y puede reasignar, como en el vídeo; cuesta más y se reserva para ese nivel. Los 9 agentes de ceremonia pasan a ser niveles (trabajador rápido, trabajador equilibrado, revisor frontier) más especialistas opt-in (`security_reviewer`, `a11y_seo_auditor`). Los guardarraíles del planificador son política de prompt, no enforcement. El issue registra nivel, modelo y esfuerzo reales para calibrar. Mecanismo plan → implementar por herramienta: Claude Code, `opusplan`; OpenCode, agentes Plan y Build con `model` por agente (ambos hechos están en su documentación **[R]**; usarlos como cambio de modelo es una inferencia); Copilot, `handoffs` con `model` en `.agent.md` **[R]**; Codex solo permite esfuerzo en modo plan (`plan_mode_reasoning_effort`) **[NV: no re-verificado hoy]**, así que ahí se cae a spawn, perfil o `/model`.

**D9. Propagación a los derivados (aprobado, opción B).** Principio del titular: separar lo que es de la plantilla de lo que es del proyecto. Se escribe un script propio mínimo, `scripts/harness-upgrade.mjs`, fuera del motor: modelo pull, 0 tokens, `--check` de deriva, versión por tag. El contenido gestionado vive en un fichero de la plantilla y se **renderiza como bloque con marcadores dentro de `AGENTS.md`**, no como import, porque la documentación oficial de Codex y la de VS Code Copilot no describe imports desde `AGENTS.md` (revisión del 2026-10-16 en la sesión de debate; Claude Code sí documenta `@`). Se descarta `actions-template-sync`: pisa con su estrategia por defecto y no conoce bloques **[NV: comportamiento no re-verificado hoy]**. Los dos derivados desfasados: ver A4.

**D10. Bucle de aprendizaje con fase de cierre (decidido; el aviso, abierto).** Una tarea nueva puede obligar a replantear tareas anteriores (concepto aportado por el titular). Al planificar se listan los issues relacionados. Al cerrar, candidatos deterministas (`git log` + `Closes #N`, con tope) alimentan un 5.º bloque del PR, "Impacto en tareas anteriores", sin tocar los 4 del vídeo; un check de CI lee el cuerpo del PR (0 tokens) y los issues afectados reciben la etiqueta `revisit` y un comentario, y decide el humano. El conocimiento duradero va a `AGENTS.md`. Sin bot retrospectivo; independiente del bot de memoria. "Todo criterio tiene un test" es la mitad determinista del bucle. Evidencia **[M]**: en un derivado hay 42 menciones de "enmienda" (un caso quedó obsoleto sin test) y en otro, 5 regresiones sobre features ya cerradas.

**D11. Bots pausados (hecho en parte).** Bot de evolución autónoma de la plantilla: cron retirado, queda `workflow_dispatch` (PR #38 fusionado **[R]**). Bot de memoria (repo privado de la organización): pausado con su PR #27 fusionado. Bot de documentación (`DocsTemplateSSDUncleBob`): su PR de pausa #28 sigue abierto, así que su cron sigue activo hasta fusionarlo (próximo disparo: martes 2026-10-20, 06:11 UTC).

## Decisiones abiertas

| # | Tema | Estado |
|---|---|---|
| A1 | Futuro de los bots: eliminarlos, dejar un mandato mínimo o reactivarlos; qué hace la web de docs tras el rediseño | Abierta; mientras tanto, pausados |
| A2 | Ejemplos: hay 4 (`go-notes-cli`, `node-notes-cli`, `python-notes-cli`, `rust-notes-cli`) y `harness-ci` ejecuta 2 **[R]**; cuáles se conservan; los checks requeridos de `main` se llaman `Arnés raíz (init)` y `Ejemplo … (init + mutación 100%)`, hay que mantener los nombres o actualizar la protección en el mismo paso | Abierta |
| A3 | Palancas de usuario (solo con OK explícito, fuera de los PRs): bajar `effortLevel` global (el defecto de los modelos 5.5 es `medium` **[R]**), `model` global, plugins globales por proyecto, plantilla de instrucciones globales (Bonus del vídeo) | Se documentan, no se instalan |
| A4 | Derivados desfasados: el antiguo, migración guiada (opción por defecto); el de otra línea, fuera hasta que el titular decida (no ha respondido) | Abierta |
| A5 | Orden de incrementos. Propuesta provisional: propagación → un incremento por paso del vídeo, por impacto en coste → dieta del motor (898 → ~300 líneas) y limpieza de `docs/` | Propuesta |
| A6 | Criterios de clasificación de niveles y qué artefactos exige cada uno (por ejemplo, ¿hay issue en trivial?) | Abierta |
| A7 | Prueba A/B de coste (trivial real, arnés viejo y nuevo, con la línea base de sesión recién abierta) y cuándo corre la mutación | Abierta |
| A8 | Formato del fichero de spec viva por capacidad; aviso `revisit` frente a proponer cambio; piloto de agentes por nivel en Copilot (no verificado si `.github/agents` y `.claude/agents` se duplican en el selector) | Abierta |

## Consecuencias

- **Positivas:** una tarea trivial costaría un contexto y ningún subagente obligatorio; desaparecen `progress/*` y el ritual de traspaso; la spec no deriva; la propagación cuesta 0 tokens y no depende del vínculo "template" de GitHub; el proceso funciona con los proveedores que el titular usa.
- **Negativas y riesgos:** sin puerta sobre el `.feature` por tarea, el control humano recae en el plan y en la revisión local; TDD y mutación solo en crítico pueden dejar pasar regresiones (se mitiga con un test por criterio y la prueba A/B); si el planificador infraclasifica, el guardarraíl es solo política de prompt; el script de propagación es código nuevo que mantener (acotado, fuera del motor); la web de documentación quedará obsoleta; mejorar en relativo puede ocultar una factura absoluta parecida si la línea base de sesión no baja.
- **Cómo se sabrá si funcionó:** tarea trivial = 1 contexto y 0 subagentes obligatorios; 9 de 9 agentes con nivel o `model` explícito; repetir la agregación de transcripciones tras tocar las palancas de usuario; los tres checks requeridos de `main` siguen verdes.

## Matriz de trazabilidad con el vídeo

Las marcas de los pasos salen de los capítulos de YouTube; las de los sub-puntos, de una transcripción propia (difieren ~1 s). Todo es paráfrasis; la transcripción no se versiona (contenido ajeno). El artefacto es *previsto*; "documentado, no instalado" = no puede vivir en el repo. Orden y número de incremento: A5.

| # | Paso o consejo (paráfrasis) | Marca | Artefacto previsto | Verificación |
|---|---|---|---|---|
| 1 | P1. Conocer el proyecto, arrancarlo y ver su interfaz antes de pedir nada | 00:29–02:13 | `bin/harness init` ligero y sección "cómo se ejecuta" en `AGENTS.md` | `Arnés raíz (init)` verde |
| 2 | P2. `AGENTS.md` en la raíz, para que sirva a todos los agentes | 02:17–02:30 | `AGENTS.md`; `CLAUDE.md` y `GEMINI.md` mínimos que lo referencian | `--check` del script de propagación |
| 3 | Contenido: resumen del proyecto, ficheros clave, comandos de validación, guardarraíles y definición de hecho | 03:31–06:00 | Plantilla de `AGENTS.md` con esos 5 bloques en la parte del proyecto | Check de CI: los 5 encabezados existen |
| 4 | Conciso: el ejemplo del vídeo ronda las 49 líneas | 06:00–06:10 | Límite de tamaño (objetivo propuesto: < 200 líneas) | Check de CI sobre el nº de líneas |
| 5 | Arrancar con el `init` de cada herramienta y luego recortar | 06:15–06:44 | Guía en `docs/` | Revisión del titular |
| 6 | P3. Modo plan antes de actuar, disponible en todas las herramientas | 06:47–07:30 · 09:03–10:30 | D4: plan en el issue, aprobado antes de implementar | Plantilla de issue con sección Plan; piloto |
| 7 | Planificar con un modelo muy capaz | 07:31–08:30 | D7 capas 0 y 1: nivel frontier para planificar | Tabla de mapeo con fecha y fuente |
| 8 | Opcional: un segundo modelo de otra familia critica el plan | 08:40–09:00 | Revisor frontier opt-in en nivel crítico | Documentado; opt-in |
| 9 | Entrevista de preguntas hasta afinar el plan (skill de Matt Pocock) | 10:44–11:23 | Entrevista propia en `docs/` o enlace al original; no se copia | Revisión del titular |
| 10 | P4. Implementar solo tras planificar | 11:27–12:07 | Regla en `AGENTS.md`; el motor ya tiene `require_approved_spec_to_implement` (a reorientar al plan) | Piloto |
| 11 | Implementar con un modelo menos capaz: más barato y más rápido | 12:16–12:50 | D8: `opusplan` y adaptadores por herramienta | Ningún agente sin nivel o `model` (hoy 9 de 9 sin él); prueba A/B |
| 12 | El planificador delega, revisa y reasigna si un modelo no termina; modelo y esfuerzo por tarea | 12:52–14:00 | D8 crítico y tabla "Delegación" (incluye "escalar si") | Piloto; revisión del titular |
| 13 | P5. Revisar antes de subir, en persona y/o con IA; sin push hasta revisar | 14:23–14:55 · 15:39–15:55 | D4: revisión local del diff antes de cualquier push | Casilla en la plantilla de PR |
| 14 | `/review` o equivalente existe en todas las herramientas | 15:03–15:30 | `/code-review` y equivalentes listados en `AGENTS.md` | Revisión del titular |
| 15 | P6. PR de cuatro bloques: qué, por qué, cómo se probó, pendiente | 16:20–16:32 | `pull_request_template.md` con los 4 y el 5.º de D10 | Check de CI sobre el cuerpo del PR |
| 16 | PR fácil y rápida de revisar | 16:37–17:00 | Guía de tamaño (≲ 250 líneas) y enlace a la guía de GitHub | PR de ejemplo la cumple |
| 17 | Skill que explica el diff visualmente (nombre **[NV]**: solo oído) | 17:12–17:35 | Opcional, tras identificar su nombre | **[NV]** |
| 18 | Cambio visual: imágenes o vídeo, con antes y después, adjuntos al PR | 17:40–17:49 · 26:02–26:48 | Línea en la plantilla de PR; `gh … --attach` (gh ≥ 2.99.0 **[R]**) | PR de ejemplo |
| 19 | P7. Tarea nueva, sesión nueva | 17:54–18:44 | Guía de higiene de sesión; el traspaso es issue y PR | Sin `progress/*` obligatorios |
| 20 | Bonus. Instrucciones de usuario compartidas por todos los repos, aparte de `AGENTS.md` | 19:04–20:40 | Plantilla en `docs/` (CLAUDE.md global y equivalentes) | Documentado, no instalado |
| 21 | Avisar si la petición se sale del objetivo de la sesión y sugerir sesión nueva con título | 20:45–21:40 | Bloque de esa plantilla | Documentado, no instalado |
| 22 | El planificador recomienda modelo y esfuerzo sin fijar un nombre concreto | 21:41–23:28 | D7 capa 0 y tabla "Delegación" | Check: el plan incluye la tabla |
| 23 | Un issue con el plan, pasos y etiquetas adaptadas (emojis opcionales) | 23:32–24:20 | D3: plantilla de issue y etiquetas | Piloto |
| 24 | Rama nueva desde la por defecto y commits convencionales | 24:47–25:11 | Regla en `AGENTS.md` | Revisión del PR piloto |
| 25 | Obedecer el `AGENTS.md` del repo además de lo global | 26:58–27:09 | Regla en esa plantilla | Documentado, no instalado |

## Fuentes

Consultadas el 2026-10-16. Fuera de este repo no hay copia de ninguna.

- Uncle Bob, post en X del 12-feb-2026: https://x.com/unclebobmartin/status/2021998958579794052
- Vídeo (return(GiS), 27:32): https://youtu.be/dhkiC4Iq1eM · Formato de ADR (Nygard, 2011): https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- BettaTech, `harness-sdd`: https://github.com/betta-tech/harness-sdd · Matt Pocock, skills (origen del skill citado en el vídeo): https://github.com/mattpocock/skills · Estándar `AGENTS.md`: https://agents.md
- Claude Code, modelos y `opusplan`: https://code.claude.com/docs/en/model-config · subagentes (`model`, `effort`, `maxTurns`): https://code.claude.com/docs/en/subagents
- Codex, `AGENTS.md` (límite 32 KiB por defecto): https://developers.openai.com/codex/guides/agents-md · subagentes (TOML por agente): https://developers.openai.com/codex/subagents
- VS Code Copilot, agentes (`.github/agents`, `.claude/agents`; `model` no documentado en el formato Claude): https://code.visualstudio.com/docs/agent-customization/custom-agents
- OpenCode, agentes (`model`, `steps`, Plan y Build): https://opencode.ai/docs/agents/ · Gemini CLI, configuración (la clave `context.fileName` frente a `contextFileName` no se pudo confirmar, **[NV]**): https://geminicli.com/docs/cli/configuration
- GitHub CLI v2.99.0 (`--attach`): https://github.com/cli/cli/releases/tag/v2.99.0 · Guía de GitHub para facilitar la revisión (la URL exacta de la descripción del vídeo no se re-verificó; esta es la guía equivalente): https://docs.github.com/en/pull-requests/concepts/helping-others-review-your-changes
