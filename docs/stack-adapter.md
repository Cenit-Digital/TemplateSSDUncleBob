# Adaptar el arnés a cualquier lenguaje

> El proceso Uncle Bob (edición artesano) es neutral al lenguaje: solo unas
> pocas piezas concretas cambian por stack. Este documento separa **lo que
> nunca cambias** de **lo que sí enchufas por lenguaje**, y da recetas
> mínimas para Python (referencia) y JavaScript/TypeScript.

## Lo que es agnóstico al stack (no lo toques)

Estas piezas funcionan igual en cualquier lenguaje. Son el corazón del
método:

- **Los seis agentes** — `spec_partner`, `gherkin_author`, `tdd_craftsman`,
  `judge`, `mutation_tester`, `craftsman_lead` (`.claude/agents/`).
- **El pipeline** — `pending → spec_ready → in_progress → done` (con
  `blocked` como estado de discusión). Ver `docs/workflow.md`.
- **`project-spec.md`** — la spec conversada.
- **Gherkin** — `features/<name>.feature`, escenarios `@s1..@sn`, cada
  `Then` medible. Ver `docs/gherkin.md`.
- **`feature_list.json`** — la cola de features y su estado.
- **`progress/`** — bitácoras de TDD, veredictos del juez y scores de
  mutación.
- **`CHECKPOINTS.md`** — la evaluación objetiva del estado final.

## Lo que enchufas por stack (cámbialo)

| Pieza | Archivo | Qué cambia |
|-------|---------|------------|
| (a) Comando de tests | `init.sh` | El comando que corre la suite y devuelve exit code |
| (b) Mutador | `tools/mutate.py` u otro | La herramienta que introduce mutantes |
| (c) Contenido de calidad | `docs/architecture.md`, `docs/conventions.md` | Capas, nombres, estilo **de tu proyecto** |
| (d) Hook de tests | `.claude/settings.json` (`PostToolUse`) | El comando de tests que corre tras cada Edit/Write |
| (e) Permisos | `.claude/settings.json` (`permissions.allow`) | Los comandos que el agente puede correr sin pedir permiso |

### (a) Comando de tests en `init.sh`

`init.sh` verifica el entorno, valida `feature_list.json` y **corre la
suite**. Cambia el bloque de "Ejecutando tests" por el comando de tu stack,
manteniendo el contrato: **exit code 0 = verde, distinto de 0 = rojo**, y el
resumen `[OK]`/`[FAIL]`.

### (b) El mutador

La prueba de mutación es obligatoria para cerrar una feature sdd. Solo
cambia la herramienta que crea los mutantes (ver `docs/mutation-testing.md`):

- **Python** — `tools/mutate.py` (incluido, sin dependencias) o `mutmut` /
  `cosmic-ray`.
- **JavaScript / TypeScript** — **Stryker** (`npx stryker run`).
- **Otros** — el mutador de tu ecosistema (p. ej. Pitest en la JVM,
  Stryker.NET en .NET). Si no hay ninguno viable, mide manualmente sobre las
  líneas críticas y documenta el criterio.

### (c) `architecture.md` y `conventions.md`

Son **contenido concreto de tu proyecto**, no del stack por defecto.
Reescríbelos con tus capas, tu flujo de datos, tu estilo y tus nombres. El
`judge` evalúa contra estos dos archivos: si no reflejan tu proyecto, el
juicio no sirve.

### (d) y (e) `.claude/settings.json`

- **`PostToolUse`** — el hook que corre los tests tras cada `Edit`/`Write`.
  Cambia su `command` al comando de tests de tu stack.
- **`Stop`** — normalmente basta con dejar `./init.sh` (ya lo adaptaste en
  el punto (a)).
- **`permissions.allow`** — lista los comandos de tu stack para que el
  agente no pida permiso en cada llamada (el runner de tests, el mutador, el
  ejecutable de tu app).

---

## Receta mínima — Python (referencia)

Ya viene configurado en la plantilla. Para referencia:

- **`init.sh`** — corre `python3 -m unittest discover -s tests -v`.
- **Mutador** — `python3 tools/mutate.py src/<archivo>.py`.
- **`.claude/settings.json`**:
  ```json
  {
    "hooks": {
      "PostToolUse": [
        {
          "matcher": "Edit|Write",
          "hooks": [
            { "type": "command",
              "command": "python3 -m unittest discover -s tests -q 2>&1 | tail -3" }
          ]
        }
      ],
      "Stop": [
        { "hooks": [ { "type": "command", "command": "./init.sh" } ] }
      ]
    },
    "permissions": {
      "allow": [
        "Bash(./init.sh)",
        "Bash(python3 -m unittest*)",
        "Bash(python3 -m src.cli*)"
      ]
    }
  }
  ```

## Receta mínima — JavaScript / TypeScript

Suponiendo `vitest` (o `jest`) para tests y **Stryker** para mutación:

- **`init.sh`** — sustituye el bloque de tests por:
  ```bash
  if npm test --silent; then
    ok "Todos los tests pasan"
  else
    fail "Hay tests rotos"; EXIT_CODE=1
  fi
  ```
  (Ajusta también la comprobación de versión: `node --version` en lugar de
  `python3 --version`.)
- **Mutador** — `npx stryker run` (configurado en `stryker.conf.json`, con
  el `testRunner` de `vitest`/`jest`).
- **`.claude/settings.json`**:
  ```json
  {
    "hooks": {
      "PostToolUse": [
        {
          "matcher": "Edit|Write",
          "hooks": [
            { "type": "command", "command": "npm test --silent 2>&1 | tail -3" }
          ]
        }
      ],
      "Stop": [
        { "hooks": [ { "type": "command", "command": "./init.sh" } ] }
      ]
    },
    "permissions": {
      "allow": [
        "Bash(./init.sh)",
        "Bash(npm test*)",
        "Bash(npx stryker*)",
        "Bash(node*)"
      ]
    }
  }
  ```
- **Gherkin** — puedes seguir traduciendo a mano cada `@s` a un test (postura
  de referencia, cero dependencias BDD) o correr los `.feature` con un runner
  BDD nativo. Lo que no cambia es la trazabilidad `@s → test`.

---

## Checklist de adaptación

- [ ] `init.sh` corre la suite de tu stack y respeta exit code 0 = verde.
- [ ] `init.sh` comprueba el runtime correcto (versión de Node/Java/… en
      lugar de Python).
- [ ] El mutador de tu stack está elegido y documentado en
      `docs/mutation-testing.md`.
- [ ] `docs/architecture.md` y `docs/conventions.md` describen **tu**
      proyecto, no el ejemplo.
- [ ] El hook `PostToolUse` corre tus tests.
- [ ] `permissions.allow` incluye los comandos de tu stack.
- [ ] Todo lo agnóstico (agentes, pipeline, Gherkin, `feature_list.json`,
      `progress/`, `CHECKPOINTS.md`) quedó **intacto**.
