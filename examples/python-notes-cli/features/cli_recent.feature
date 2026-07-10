Feature: Listar las notas más recientes
  Como usuario quiero ver mis últimas notas sin listar todo el archivo.

  # Contrato heredado: esta feature se cerró antes de adoptar el flujo
  # Gherkin. El .feature documenta su contrato a posteriori para que el
  # arnés (init.sh, judge) lo trate igual que al resto.

  @s1
  Scenario: Por defecto muestra hasta 5 notas, más recientes primero
    Given un almacén con 7 notas creadas en instantes distintos
    When ejecuto "python -m src.cli recent"
    Then la salida lista 5 notas
    And están ordenadas por created_at descendente
    And el código de salida es 0

  @s2
  Scenario: El flag --limit cambia el número de notas
    Given un almacén con 7 notas
    When ejecuto "python -m src.cli recent --limit 3"
    Then la salida lista exactamente 3 notas

  @s3
  Scenario: Un límite no positivo es un error
    Given un almacén con notas
    When ejecuto "python -m src.cli recent --limit 0"
    Then stderr contiene un mensaje sobre --limit
    And el código de salida es distinto de 0

  @s4
  Scenario: Almacén vacío no imprime nada
    Given un almacén de notas vacío
    When ejecuto "python -m src.cli recent"
    Then la salida estándar está vacía
    And el código de salida es 0

  @s5
  Scenario: El formato de cada línea coincide con list
    Given un almacén con 2 notas
    When ejecuto "python -m src.cli recent"
    Then cada línea tiene la forma "<id>\t<created_at>\t<title>"
