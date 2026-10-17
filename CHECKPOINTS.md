# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano. Son **agnósticos al lenguaje**: los
> comandos concretos salen de `harness.config.json`.

## C1 — El arnés está completo

- [ ] Existen los ficheros base: `AGENTS.md`, `CLAUDE.md`, `CHECKPOINTS.md`,
      `harness.config.json`.
- [ ] Existen los docs: `docs/workflow.md`, `docs/architecture.md`,
      `docs/conventions.md`, `docs/verification.md`.
- [ ] `bin/harness init` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Si el proyecto conserva `feature_list.json`: como mucho una feature en
      `in_progress`.
- [ ] Toda tarea terminada tiene tests asociados que pasan.

## C3 — El código respeta la arquitectura

- [ ] `src/` solo contiene los módulos previstos en `docs/architecture.md`.
- [ ] No hay dependencias externas no justificadas.
- [ ] No hay logs de debug sueltos, ni TODOs sin contexto.

## C4 — La verificación es real

- [ ] Hay al menos un test por módulo de `src/`.
- [ ] Los tests usan aislamiento real (p. ej. directorios temporales), no
      mocks de sistema de ficheros.
- [ ] `bin/harness test` muestra > 0 tests y todos verdes.

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (temporales, cachés fuera del
      `.gitignore`).
- [ ] La última tarea trabajada está reflejada en su issue (casillas y
      «Resultados de la ejecución») o, si no hay issue, en el PR (y en
      `feature_list.json` si el proyecto lo conserva).

## C6 — Contrato Gherkin (BDD)

- [ ] Toda capacidad con criterios Given/When/Then tiene su
      `features/<capacidad>.feature`, actualizado en el mismo PR.
- [ ] El `.feature` usa Gherkin con escenarios tagueados `@s1`, `@s2`, …
      y cada `Then` afirma algo medible (ver `docs/gherkin.md`).
- [ ] Cada escenario `@s` está cubierto por al menos un test concreto
      (mapa `@s → test` en el issue o en el PR).
- [ ] No hay código de producción que ningún test rojo haya pedido
      (disciplina TDD, ver `docs/tdd.md`).

## C7 — Prueba de mutación (solo nivel crítico)

Solo aplica si el plan clasificó la tarea como **crítica**; en los demás
niveles no se corre (política en `docs/verification.md`).

- [ ] La tarea crítica superó la prueba de mutación
      (`bin/harness mutate <módulo>`) sobre los módulos que fija el plan, con
      la puntuación por encima del umbral de `harness.config.json`
      (`mutation.threshold`, 0,8 por defecto).
- [ ] Cualquier mutante sobreviviente queda documentado en el issue o en
      el PR (matado con un test nuevo, o justificado como equivalente).

---

**Cómo usar este archivo:** quien revisa el trabajo
recorre C1-C6 y, si la tarea es crítica, C7 (`bin/harness mutate <módulo>`).
Se rechaza el cierre de sesión si quedan boxes vacíos.
