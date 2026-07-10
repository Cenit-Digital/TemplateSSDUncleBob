Feature: Contar notas
  Como usuario quiero saber cuántas notas tengo para tener una visión rápida.

  @s1
  Scenario: Almacén vacío imprime 0
    Given un almacén de notas vacío
    When ejecuto el comando "count"
    Then la salida estándar es exactamente "0"
    And el código de salida es 0

  @s2
  Scenario: Varias notas imprime el total exacto
    Given un almacén con 3 notas
    When ejecuto el comando "count"
    Then la salida estándar es exactamente "3"

  @s3
  Scenario: count no crea el almacén cuando no existe
    Given que el archivo de notas no existe
    When ejecuto el comando "count"
    Then el código de salida es 0
    And el archivo de notas sigue sin existir
