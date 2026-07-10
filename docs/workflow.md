# El flujo Uncle Bob (Harness Engineering, edición artesano)

> Esta plantilla reorganiza el desarrollo alrededor del proceso que
> Robert C. Martin describe en su hilo: **conversar la spec, destilarla en
> escenarios Gherkin, tallar el código con TDD estricto, podar con juicio y
> validar con prueba de mutación**. El proceso es fijo; el stack es tuyo
> (declarado en `harness.config.json`).

## El pipeline de un vistazo

```
pending
  │  spec_partner — CONVERSACIÓN  ───────────────►  project-spec.md
  │      "We debate various topics and decisions."
  │
  │  gherkin_author — DESTILACIÓN ───────────────►  features/<name>.feature
  │      ".feature files from the project-spec.md"
  │
  ▼  ⏸  PUERTA HUMANA: el humano aprueba los escenarios (el contrato)
  │
in_progress
  │  tdd_craftsman — ROJO → VERDE → REFACTOR ────►  src/ + tests/
  │      un test a la vez; las Tres Leyes del TDD
  │
  │  judge — REVIEW ─────────────────────────────►  progress/judge_<name>.md
  │      "The review step is the whole game. Agents draft, judgment prunes."
  │
  │  mutation_tester — MUTACIÓN ─────────────────►  progress/mutation_<name>.md
  │      "Mutation testing is resource-heavy, but the ROI… is worth every cycle."
  ▼
done
```

Una sola feature a la vez. Una sola puerta de aprobación humana: sobre los
escenarios Gherkin, **antes** de escribir producción.

## Por qué este orden (los insights del hilo)

### 1. La spec nace de una conversación, no de un dictado
El humano no entrega un documento cerrado. Debate con el `spec_partner`:
casos límite, contratos de salida, alternativas descartadas. El resultado,
`project-spec.md`, es el acuerdo razonado — incluidas las **decisiones** y su
porqué. Una spec sin debate esconde los huecos; el debate los saca. (En los
vídeos de origen esto se llama pasar de una spec sencilla a mano a una
**"hard spec"** ampliada con ayuda de la IA.)

### 2. Gherkin convierte la prosa en un contrato ejecutable
Cada comportamiento se vuelve un `Scenario` con `Given/When/Then`
verificable. Esto es lo que el humano firma. A partir de aquí, la ambigüedad
es un bug del contrato, no del código. Ver `docs/gherkin.md`.

### 3. La puerta humana va sobre el contrato, no sobre el código
Aprobar tarde (cuando ya hay código) es caro. Aprobar el `.feature` es barato
y es el punto de máximo apalancamiento: un escenario mal definido arrastra
todo el TDD. El `craftsman_lead` **para** aquí y espera. No es un flujo 100%
automático: hay un humano en el bucle en este punto exacto.

### 4. TDD estricto: un test a la vez
No se escriben todos los tests por adelantado. Se vive el ciclo pequeño: un
test rojo → el mínimo verde → refactor en verde. Las Tres Leyes en
`docs/tdd.md`. El código que ningún test pidió no existe.

### 5. El review es el juego entero
> "Agents draft, judgment prunes."

Generar borradores es barato (el modelo teclea infinito). El valor escaso es
el **juicio** que decide qué sobrevive. El `judge` no edita: poda. Si un
escenario no tiene test, o hay código que nadie pidió, rechaza.

### 6. La validación es el nuevo cuello de botella, y es compute-bound
> "Raw computer power is the limiting factor."

Una suite verde solo dice que el código no explota, no que los tests sirvan.
La prueba de mutación introduce defectos y exige que algún test falle. Es
cara en CPU —reejecuta la suite por cada mutante— pero es la medida real de
si la red atrapa peces. Ver `docs/mutation-testing.md`.

## Los handoffs: estado en disco, no en chat

Cada fase la ejecuta un subagente distinto que **escribe su resultado en un
fichero** y devuelve una sola línea de referencia. El siguiente agente lo
lee. Esto no es cosmético: limita el contexto de cada agente (cada uno ve
solo lo que necesita), sobrevive a reinicios, y evita el "teléfono
descompuesto" de pasar contenido por el chat. Es también lo que mantiene el
consumo de tokens bajo control en un flujo multi-agente.

## Mapa de artefactos (quién escribe qué)

| Archivo                        | Lo escribe                     | Contiene                                            |
| ------------------------------ | ------------------------------ | --------------------------------------------------- |
| `project-spec.md`              | spec_partner                   | Spec conversada: propósito, contrato, decisiones    |
| `features/<name>.feature`      | gherkin_author                 | Escenarios Gherkin `@s1..@sn` (el contrato firmado) |
| `src/`, `tests/`               | tdd_craftsman                  | Código y tests, tallados por TDD                    |
| `progress/tdd_<name>.md`       | tdd_craftsman                  | Bitácora de ciclos + mapa `@s → test`               |
| `progress/judge_<name>.md`     | judge                          | Veredicto de review + checkpoints                   |
| `progress/mutation_<name>.md`  | mutation_tester                | Score de mutación + mutantes sobrevivientes         |
| `feature_list.json`            | craftsman_lead / tdd_craftsman | `pending → spec_ready → in_progress → done`         |

## Niveles de arnés (contexto)

El método de BettaTech distingue niveles de "arnés": desde **usar un agente
existente** (Claude Code) añadiéndole agentes en Markdown y un flujo — que es
lo que hace esta plantilla — hasta **construir tu propio arnés** con llamadas
directas al SDK (p. ej. en Go). Esta plantilla vive en el primer nivel: el más
práctico y reutilizable.
