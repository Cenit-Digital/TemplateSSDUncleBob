Feature: Filtrar notas por fecha
  Como usuario quiero ver lo que apunté desde una fecha dada para revisar
  mi actividad reciente sin listar todo el archivo.

  @s1
  Scenario: Una nota creada exactamente en la fecha dada entra (límite inclusivo)
    Given un almacén con una nota creada el "2026-05-01" a las 23:00
    When ejecuto "python -m src.cli since 2026-05-01"
    Then la salida estándar incluye la línea de esa nota
    And el código de salida es 0

  @s2
  Scenario: Las notas anteriores a la fecha quedan fuera y las posteriores entran
    Given un almacén con una nota del "2026-04-30" y otra del "2026-05-02"
    When ejecuto "python -m src.cli since 2026-05-01"
    Then la salida estándar incluye la línea de la nota del "2026-05-02"
    And la salida estándar no incluye la línea de la nota del "2026-04-30"
    And el código de salida es 0

  @s3
  Scenario: Las notas coincidentes se ordenan por created_at descendente
    Given un almacén con notas del "2026-05-01", "2026-05-03" y "2026-05-02"
    When ejecuto "python -m src.cli since 2026-05-01"
    Then la salida lista las 3 notas ordenadas por created_at descendente
    And la primera línea corresponde a la nota del "2026-05-03"
    And la última línea corresponde a la nota del "2026-05-01"

  @s4
  Scenario: El formato de cada línea coincide con list
    Given un almacén con 2 notas creadas en o después del "2026-05-01"
    When ejecuto "python -m src.cli since 2026-05-01"
    Then cada línea tiene la forma "<id>\t<created_at>\t<title>"

  @s5
  Scenario: Una fecha con formato inválido es un error
    Given un almacén con notas
    When ejecuto "python -m src.cli since 2026/05/01"
    Then stderr contiene un mensaje sobre la fecha
    And el código de salida es distinto de 0

  @s6
  Scenario: Una fecha imposible de calendario es un error
    Given un almacén con notas
    When ejecuto "python -m src.cli since 2026-13-40"
    Then stderr contiene un mensaje sobre la fecha
    And el código de salida es distinto de 0

  @s7
  Scenario: Sin coincidencias no imprime nada
    Given un almacén con una nota del "2026-04-30"
    When ejecuto "python -m src.cli since 2026-05-01"
    Then la salida estándar está vacía
    And el código de salida es 0

  @s8
  Scenario: Almacén vacío no imprime nada
    Given un almacén de notas vacío
    When ejecuto "python -m src.cli since 2026-05-01"
    Then la salida estándar está vacía
    And el código de salida es 0

  @s9
  Scenario: since no modifica el almacén
    Given un almacén con 2 notas creadas en o después del "2026-05-01"
    When ejecuto "python -m src.cli since 2026-05-01"
    Then el archivo de notas queda byte a byte igual que antes
    And el código de salida es 0
