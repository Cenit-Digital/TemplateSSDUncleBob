# Adaptador: Python (cero dependencias)

Mapea el arnés a un proyecto Python usando solo la stdlib.

## `harness.config.json`

```json
{
  "language": "python",
  "commands": {
    "test": "{{py}} -m unittest discover -s tests -q",
    "mutate": "{{py}} tools/mutate.py {{target}}"
  },
  "mutation": { "threshold": 1.0, "targets": ["src/mi_modulo.py"] }
}
```

- `{{py}}` lo resuelve el motor a `python3` o `python`.
- El mutador `tools/mutate.py` es propio y sin dependencias: muta operadores,
  palabras clave, números y `return`, valida que compile y restaura el
  original. Fuerza salida UTF-8 (portable en Windows).

## Layout típico

```
src/*.py          tests/test_*.py     tools/mutate.py
```

## Ejemplo ejecutable

`examples/python-notes-cli` — flujo Uncle Bob completo, 47 tests, mutación
100% en los 3 módulos. Cópialo como punto de partida.

## Producción

Para proyectos grandes puedes cambiar el runner a `pytest` y el mutador a
[`mutmut`](https://github.com/boxed/mutmut) o
[`cosmic-ray`](https://github.com/sixty-north/cosmic-ray):

```json
"commands": {
  "lint": "ruff check . && mypy src",
  "test": "pytest -q",
  "mutate": "mutmut run"
}
```
