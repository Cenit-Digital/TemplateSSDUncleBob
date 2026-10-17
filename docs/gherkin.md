# Gherkin — criterios de aceptación en Given/When/Then

> Los criterios se escriben en Given/When/Then porque también los leen personas no técnicas. Viven en la sección «Criterios de aceptación» del issue de tarea (`.github/ISSUE_TEMPLATE/tarea.md`) o, si no hay issue, en el plan. No hay agente propio ni una aprobación aparte del `.feature`: la persona aprueba el plan, que ya los incluye.

## Dónde viven

- **En el issue o el plan:** un criterio = un test. Cada `Then` afirma algo medible.
- **Spec viva (opcional):** un fichero por capacidad, `features/<capacidad>.feature`. El mismo PR que cambia el comportamiento lo actualiza en su diff, así no deriva. No se ejecuta con ningún runner BDD (ver abajo).

## Estructura

```gherkin
Feature: <propósito en una frase>
  Como <rol> quiero <capacidad> para <beneficio>.   # contexto opcional

  @s1
  Scenario: <comportamiento observable>
    Given <estado de partida>
    When <acción concreta del usuario>
    Then <resultado medible: salida / error / código de salida / estado>
```

## Reglas

- **Un `Scenario` por comportamiento observable**, incluidos los caminos de error (id inexistente, entrada inválida, estado vacío).
- **Tags estables** `@s1`, `@s2`… en los `.feature`: son el identificador que citan los tests.
- **Cada `Then` afirma algo medible.** Prohibido «el sistema funciona». Se vale: «Then la salida es exactamente `3`», «Then el código de salida es distinto de 0».
- **Un solo `When` por escenario.** Si necesitas dos acciones, son dos escenarios.
- **Sin detalles de implementación:** comportamiento, no funciones ni variables.

## Ejemplo (agnóstico)

```gherkin
Feature: Contar notas
  Como usuario quiero saber cuántas notas tengo para tener una visión rápida.

  @s1
  Scenario: Almacén vacío imprime 0
    Given un almacén de notas vacío
    When ejecuto el comando "count"
    Then la salida estándar es exactamente "0"
    And el código de salida es 0

  @s2
  Scenario: count no modifica el almacén
    Given un almacén con 2 notas
    When ejecuto el comando "count"
    Then el archivo de notas queda byte a byte igual que antes
```

## De Gherkin a test

No se usa runner BDD (behave, pytest-bdd, cucumber-js): no añade dependencias ni acopla el contrato a un framework. Cada criterio se traduce **a mano** a un test cuyo nombre lo cita (`@s1` → `test_count_archivo_vacio`), y el PR lo declara en «Cómo se probó». Así el texto sigue siendo la fuente legible por la persona, sin pagar un framework.
