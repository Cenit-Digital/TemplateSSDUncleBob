# El flujo Uncle Bob (Harness Engineering, edición artesano)

> Esta plantilla organiza **cualquier proyecto** alrededor del proceso Uncle
> Bob (edición artesano): **conversar la spec, destilarla en escenarios
> Gherkin, tallar el código con TDD estricto, podar con juicio y validar con
> prueba de mutación**. El dominio de tu aplicación es lo de menos; lo que la
> plantilla aporta es el *proceso*. Para verlo resuelto de punta a punta
> sobre un caso concreto, mira `examples/notes-cli/`.

> **Nota de stack.** El pipeline, los seis agentes y los artefactos son
> neutrales al lenguaje. Solo cambian los *comandos concretos* (correr la
> suite, mutar) y algún documento de contenido específico del proyecto. Cómo
> enchufar otro lenguaje está en `docs/stack-adapter.md`. Python es el stack
> de referencia documentado.

## El pipeline de un vistazo

```
pending
  │  spec_partner — CONVERSACIÓN  ───────────────►  project-spec.md
  │      debate: casos límite, contratos de salida, alternativas descartadas
  │
  │  gherkin_author — DESTILACIÓN ───────────────►  features/<name>.feature
  │      traduce la spec conversada a escenarios firmables
  │
  ▼  ⏸  PUERTA HUMANA: el humano aprueba los escenarios (el contrato)
  │
in_progress
  │  tdd_craftsman — ROJO → VERDE → REFACTOR ────►  src/ + tests/
  │      un test a la vez; las Tres Leyes del TDD
  │
  │  judge — REVIEW ─────────────────────────────►  progress/judge_<name>.md
  │      el review es el juego entero: los agentes redactan, el juicio poda
  │
  │  mutation_tester — MUTACIÓN ─────────────────►  progress/mutation_<name>.md
  │      la mutación es cara en CPU, pero el ROI en corrección lo vale
  ▼
done
```

Una sola feature a la vez. Una sola puerta de aprobación humana: sobre los
escenarios Gherkin, **antes** de escribir producción.

## Por qué este orden (los insights)

### 1. La spec nace de una conversación, no de un dictado
El humano no entrega un documento cerrado. Debate con el `spec_partner`:
casos límite, contratos de salida, alternativas descartadas. El resultado,
`project-spec.md`, es el acuerdo razonado — incluidas las **decisiones** y
su porqué. Una spec sin debate esconde los huecos; el debate los saca.

### 2. Gherkin convierte la prosa en un contrato ejecutable
Una vez cerrado el `project-spec.md`, se destila en un conjunto de archivos
`.feature`. Cada comportamiento se vuelve un `Scenario` con `Given/When/Then`
verificable. Esto es lo que el humano firma. A partir de aquí, la ambigüedad
es un bug del contrato, no del código. Ver `docs/gherkin.md`.

### 3. La puerta humana va sobre el contrato, no sobre el código
Aprobar tarde (cuando ya hay código) es caro. Aprobar el `.feature` es
barato y es el punto de máximo apalancamiento: un escenario mal definido
arrastra todo el TDD. El `craftsman_lead` **para** aquí y espera.

### 4. TDD estricto: un test a la vez
La respuesta de este método a "¿escribo todos los tests por delante o un
test seguido de su código?" es clara: **single test followed by code**. Se
vive el ciclo pequeño: un test rojo → el mínimo verde → refactor en verde.
Las Tres Leyes en `docs/tdd.md`. El código que ningún test pidió no existe.

### 5. El review es el juego entero
En la formulación de este método (consigna de enseñanza de BettaTech), *el
review es el juego entero: los agentes redactan, el juicio poda*. Generar
borradores es barato (el modelo teclea infinito). El valor escaso es el
**juicio** que decide qué sobrevive. El `judge` no edita: poda. Si un
escenario no tiene test, o hay código que nadie pidió, rechaza.

### 6. La validación es el nuevo cuello de botella, y es compute-bound
También en la formulación de este método: *el poder de cómputo pasa a ser el
factor limitante*, y *el ROI de la prueba de mutación compensa cada ciclo*.
Una suite verde solo dice que el código no explota, no que los tests sirvan.
La prueba de mutación introduce defectos y exige que algún test falle. Es
cara en CPU —reejecuta la suite por cada mutante— pero es la medida real de
si la red atrapa peces. Ver `docs/mutation-testing.md`.

## Mapa de artefactos (quién escribe qué)

| Archivo                          | Lo escribe        | Contiene                                            |
|----------------------------------|-------------------|-----------------------------------------------------|
| `project-spec.md`                | spec_partner      | Spec conversada: propósito, contrato, decisiones    |
| `features/<name>.feature`        | gherkin_author    | Escenarios Gherkin `@s1..@sn` (el contrato firmado) |
| `src/`, `tests/`                 | tdd_craftsman     | Código y tests, tallados por TDD                    |
| `progress/tdd_<name>.md`         | tdd_craftsman     | Bitácora de ciclos + mapa `@s → test`               |
| `progress/judge_<name>.md`       | judge             | Veredicto de review + checkpoints                   |
| `progress/mutation_<name>.md`    | mutation_tester   | Score de mutación + mutantes sobrevivientes         |
| `feature_list.json`              | craftsman_lead / tdd_craftsman | `pending → spec_ready → in_progress → done` |

Regla anti-teléfono-descompuesto: los subagentes escriben en disco y
devuelven una línea de referencia. El contenido no circula por chat.

> Para ver instancias reales de todos estos artefactos (un `project-spec.md`
> conversado, `features/cli_count.feature`, bitácoras de TDD, veredictos del
> juez y scores de mutación), abre `examples/notes-cli/`.

## Sobre las consignas del método

Las frases "el review es el juego entero / los agentes redactan, el juicio
poda", "el poder de cómputo es el factor limitante" y "el ROI de la mutación
compensa cada ciclo" son **paráfrasis didácticas de BettaTech**, no citas
textuales de Robert C. Martin. Se usan aquí como consignas del método.

Posiciones **verificadas** de Uncle Bob que sí puedes citar directamente:

- Las **Tres Leyes del TDD**
  (blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html).
- La **prueba de mutación como medida de la estabilidad semántica** de una
  suite (su artículo de 2016 sobre mutation testing).
- Su postura real sobre código escrito por agentes: no lo revisa línea a
  línea; en su lugar **mide** cobertura de tests, estructura de
  dependencias, complejidad ciclomática, tamaño de los módulos y prueba de
  mutación. Este arnés automatiza justo esas mediciones (ver
  `docs/architecture.md` y `docs/verification.md`).
