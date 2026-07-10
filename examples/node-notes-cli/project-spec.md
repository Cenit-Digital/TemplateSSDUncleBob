# project-spec.md — node-notes-cli

Ejemplo de referencia del arnés SSD Uncle Bob para el stack **Node/JavaScript**
(cero dependencias). Réplica funcional del ejemplo Python.

## Propósito

Una CLI mínima de notas que persiste en un JSON legible. Lo importante no es
la app, sino demostrar el proceso (conversación → Gherkin → TDD estricto →
review → mutación) en un stack distinto al de Python, reutilizando el mismo
motor de arnés agnóstico.

## Contrato general

- Persistencia atómica en `.notes.json` (temporal + rename), UTF-8, 2 espacios.
- Los errores del dominio (`NoteError`) salen por stderr con código 1.
- Comando desconocido o ausente: código 2.

## Feature: `count`

- **Propósito:** contar las notas almacenadas.
- **Comportamiento:** imprime un entero único (el total) por stdout.
- **Contrato:** almacén vacío → `0`. No modifica ni crea el archivo.
- **Decisión:** salida "cruda" (solo el número), coherente con `list`, para que
  sea componible en pipes de shell. Escenarios en `features/count.feature`
  (`@s1..@s3`), cubiertos en `test/cli.test.mjs`.
