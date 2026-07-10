# Gherkin — el contrato ejecutable

> "Once the project-spec.md is done, I have it create a set of .feature
> files from the project-spec.md." Los `.feature` son lo que el humano
> aprueba en la puerta, y el mapa que el `tdd_craftsman` recorre.

Los archivos viven en `features/<name>.feature`, donde `<name>` coincide
con el campo `name` de `feature_list.json`.

## Estructura

```gherkin
Feature: <propósito en una frase>
  Como <rol> quiero <capacidad> para <beneficio>.   # contexto opcional

  @s1
  Scenario: <comportamiento observable>
    Given <estado de partida>
    When <acción concreta del usuario>
    Then <resultado medible: stdout / stderr / exit code>

  @s2
  Scenario: <caso límite o error>
    Given ...
    When ...
    Then ...
```

## Reglas duras

- **Un `Scenario` por comportamiento observable**, incluidos los caminos de
  error (id inexistente, flag inválido, archivo vacío). Si el
  `project-spec.md` menciona un caso límite, tiene su escenario.
- **Tags estables** `@s1`, `@s2`, … Son el identificador que el
  `tdd_craftsman` (mapa `@s → test`) y el `judge` (cobertura) citan.
- **Cada `Then` afirma algo medible.** Prohibido "el sistema funciona". Se
  vale: "Then la salida estándar es exactamente `3`", "Then el código de
  salida es distinto de 0", "Then stderr contiene `--limit`".
- **Un solo `When` por escenario** (la acción bajo prueba). Si necesitas
  dos acciones, probablemente son dos escenarios.
- **Sin detalles de implementación.** El `.feature` describe
  comportamiento, no funciones ni nombres de variables.

## Ejemplo (feature `cli_count`)

```gherkin
Feature: Contar notas
  Como usuario quiero saber cuántas notas tengo para tener una visión rápida.

  @s1
  Scenario: Archivo vacío imprime 0
    Given un almacén de notas vacío
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "0"
    And el código de salida es 0

  @s2
  Scenario: Varias notas imprime el total exacto
    Given un almacén con 3 notas
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "3"

  @s3
  Scenario: count no modifica el almacén
    Given un almacén con 2 notas
    When ejecuto "python -m src.cli count"
    Then el archivo de notas queda byte a byte igual que antes
```

## De Gherkin a test

No usamos un runner BDD (`behave`, `pytest-bdd`) para no añadir
dependencias externas — `requirements.txt` debe quedar vacío
(`CHECKPOINTS.md` C3). En su lugar, cada `Scenario` se traduce **a mano** a
un test de `unittest` cuyo nombre cita el escenario:

```
@s1 → test_count_archivo_vacio
@s2 → test_count_varias_notas
@s3 → test_count_no_muta_archivo
```

El `tdd_craftsman` escribe estos tests uno a uno (Rojo→Verde→Refactor) y
deja el mapa en `progress/tdd_<name>.md`. Así el `.feature` sigue siendo la
fuente de verdad legible por el humano, sin pagar el coste de un framework.
