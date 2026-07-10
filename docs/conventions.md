# Convenciones de código

> Homogeneidad extrema. La IA (y el humano) predice mejor cuando el
> repositorio se parece a sí mismo en todas partes. Estas convenciones son el
> marco neutral al stack; abajo tienes la referencia concreta para Python.
> Para otros lenguajes, fija tus equivalentes en `docs/stack-adapter.md`.

## Marco (neutral al stack)

1. **Homogeneidad extrema.** Un solo estilo en todo el repo: un formateador,
   una convención de nombres, un layout de archivos. La consistencia importa
   más que la preferencia personal. Elige uno y aplícalo en todas partes.

2. **Nombres reveladores.** El nombre dice qué hace algo, no cómo. Prefiere
   nombres largos y claros a abreviaturas. Un buen nombre ahorra un
   comentario.

3. **Funciones cortas.** Cada función hace una cosa. Si necesitas un
   comentario para separar "secciones" dentro de una función, son dos
   funciones. Extrae hasta que no quede duplicación ni pasos mezclados.

4. **Manejo de errores por contrato.** Cada función declara —por su firma,
   sus tipos de error o su documentación— qué hace cuando falla. Los errores
   se señalan de forma explícita y nombrada (ver `docs/architecture.md`),
   nunca se tragan en silencio. El error se traduce a la frontera del sistema
   (CLI/API) a un mensaje y un código de salida claros, sin filtrar trazas
   internas al usuario.

5. **Comentarios solo para el *porqué* no obvio.** Por defecto **no** se
   escriben. Se permiten cuando explican una decisión no evidente (un
   workaround documentado, una invariante sutil, un enlace a la razón). Los
   nombres deben hacer el resto.

6. **Un archivo de test por módulo.** `tests/test_<módulo>` refleja
   `src/<módulo>`. Un lector encuentra los tests de una unidad sin buscar.

7. **Tests con recursos reales, no mocks del sistema de archivos.** Los tests
   usan directorios/archivos temporales reales y limpian tras de sí. Mockear
   el filesystem oculta bugs de IO reales (permisos, atomicidad, encoding);
   un temporal de verdad los expone.

---

## Referencia: Python (stack de referencia)

> Esta es la instancia concreta del marco anterior para el stack por defecto.
> Si tu proyecto usa otro lenguaje, reemplaza esta sección por su equivalente
> y apúntalo en `docs/stack-adapter.md`.

### Estilo

- **Versión:** Python 3.9+ (sintaxis `list[str]` permitida).
- **Formato:** PEP 8. Líneas máximo 100 caracteres.
- **Imports:** stdlib primero, luego locales. Una línea por módulo.
- **Strings:** comillas dobles `"..."` siempre. Comillas simples solo para
  escapar comillas dobles dentro.
- **f-strings** para interpolación. Nada de `.format()` ni `%`.

### Nombres

| Tipo                    | Convención        | Ejemplo               |
|-------------------------|-------------------|-----------------------|
| Módulos                 | `snake_case`      | `notes.py`            |
| Clases                  | `PascalCase`      | `Note`                |
| Funciones / variables   | `snake_case`      | `load_notes`          |
| Constantes              | `UPPER_SNAKE`     | `DEFAULT_NOTES_PATH`  |
| Privadas                | prefijo `_`       | `_atomic_write`       |

### Estructura de archivo

Cada archivo en `src/` empieza con:

```python
"""Una línea describiendo el propósito del módulo."""
from __future__ import annotations

# imports stdlib
import json
import os

# imports locales
from src.notes import Note
```

### Tests

- Un archivo de test por módulo: `tests/test_<módulo>.py`.
- Una clase `Test<Cosa>(unittest.TestCase)` por unidad lógica.
- Cada test usa un `tempfile.TemporaryDirectory()` y limpia tras de sí.
- Nombres de test descriptivos: `test_load_returns_empty_when_file_missing`.

### Manejo de errores

Excepciones del dominio en `src/notes.py`:

```python
class NoteError(Exception):
    """Base para errores del dominio."""

class NoteNotFound(NoteError):
    """Se lanza cuando se busca una nota inexistente."""
```

El CLI captura excepciones del dominio, imprime el mensaje al flujo de error
estándar y sale con código 1. Nunca propaga trazas al usuario.
