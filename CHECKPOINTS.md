# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.
>
> Los criterios son neutrales respecto al stack. Para el comando concreto de
> cada verificación, ver `docs/stack-adapter.md` (Python es el de referencia).

## C1 — El arnés está completo

- [ ] Existen los 4 archivos base: `AGENTS.md`, `init.sh`, `feature_list.json`,
      `progress/current.md`.
- [ ] Existen los 3 docs: `docs/architecture.md`, `docs/conventions.md`,
      `docs/verification.md`.
- [ ] `./init.sh` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] `progress/current.md` está vacío o describe la sesión activa
      (no contiene basura de sesiones anteriores).

## C3 — El código respeta la arquitectura

- [ ] `src/` solo contiene los módulos previstos en `docs/architecture.md`.
- [ ] No hay dependencias externas no justificadas (el manifiesto de
      dependencias está vacío o cada entrada está motivada en
      `docs/architecture.md`; ver `docs/stack-adapter.md` para el stack
      concreto — en Python, `requirements.txt` vacío o inexistente).
- [ ] No hay trazas de debug sueltas ni TODOs sin contexto.

## C4 — La verificación es real

- [ ] `tests/` tiene al menos un test real por módulo de `src/`.
- [ ] Los tests ejercitan el sistema de verdad: donde se pueda usar el
      recurso real (sistema de archivos, reloj, entorno), no se mockea
      (ver `docs/stack-adapter.md`; en Python, `tempfile.TemporaryDirectory()`
      en vez de mocks de fs).
- [ ] El runner de tests del proyecto muestra > 0 tests y todos verdes
      (comando concreto en `docs/stack-adapter.md`; en Python,
      `python3 -m unittest discover -s tests -v`).

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (`*.tmp`, artefactos de build
      fuera del `.gitignore`).
- [ ] `progress/history.md` tiene una entrada por la última sesión.
- [ ] La última feature trabajada está reflejada en su estado correcto.

## C6 — Contrato Gherkin (BDD)

- [ ] Toda feature con `"sdd": true` en estado `spec_ready`, `in_progress`
      o `done` tiene su `features/<name>.feature` y una sección en
      `project-spec.md`.
- [ ] El `.feature` usa Gherkin con escenarios tagueados `@s1`, `@s2`, …
      y cada `Then` afirma algo medible (ver `docs/gherkin.md`).
- [ ] Cada escenario `@s` está cubierto por al menos un test concreto en
      `tests/` (mapa `@s → test` en `progress/tdd_<name>.md`).
- [ ] No hay código de producción que ningún test rojo haya pedido
      (disciplina TDD, ver `docs/tdd.md`).

## C7 — Prueba de mutación

- [ ] La feature `done` superó la prueba de mutación
      (`tools/mutate.py` sobre el/los módulo(s) de la feature; Python de
      referencia, ver `docs/stack-adapter.md`) con la puntuación por encima
      del umbral de `docs/mutation-testing.md`.
- [ ] Cualquier mutante sobreviviente queda documentado en
      `progress/mutation_<name>.md` (matado con un test nuevo, o
      justificado como equivalente).

---

**Cómo usar este archivo:** el agente `judge` (`.claude/agents/judge.md`)
recorre C1-C6 y el `mutation_tester` valida C7. Se rechaza el cierre de
sesión si quedan boxes vacíos.
