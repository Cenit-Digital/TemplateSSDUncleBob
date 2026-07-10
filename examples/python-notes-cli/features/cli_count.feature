Feature: Contar notas
  Como usuario quiero saber cuántas notas tengo de un vistazo para tener
  una visión rápida del almacén, componible con otras herramientas.

  @s1
  Scenario: Almacén vacío imprime 0
    Given un almacén de notas vacío
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "0"
    And el código de salida es 0

  @s2
  Scenario: Almacén inexistente imprime 0
    Given que no existe el archivo de notas
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "0"
    And el código de salida es 0

  @s3
  Scenario: Una sola nota imprime 1
    Given un almacén con 1 nota
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "1"
    And el código de salida es 0

  @s4
  Scenario: Varias notas imprime el total exacto
    Given un almacén con 3 notas
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "3"
    And el código de salida es 0

  @s5
  Scenario: La salida es un entero pelado sin texto descriptivo
    Given un almacén con 2 notas
    When ejecuto "python -m src.cli count"
    Then la salida estándar es exactamente "2"
    And la salida estándar no contiene la cadena "Total"

  @s6
  Scenario: count no modifica el almacén
    Given un almacén con 2 notas
    When ejecuto "python -m src.cli count"
    Then el archivo de notas queda byte a byte igual que antes
    And el código de salida es 0

  @s7
  Scenario: count es idempotente al ejecutarse en almacén inexistente
    Given que no existe el archivo de notas
    When ejecuto "python -m src.cli count"
    Then el archivo de notas sigue sin existir
    And el código de salida es 0
