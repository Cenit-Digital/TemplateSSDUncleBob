# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra**.
> Toda feature termina con evidencia ejecutable, no con afirmaciones.

## Niveles de verificación

### Nivel 1 — Tests unitarios (obligatorio)

Toda función pública en `src/` tiene al menos un test en `tests/` que:

1. Cubre el camino feliz.
2. Cubre al menos un camino de error si la función puede fallar.

Comando:
```bash
python3 -m unittest discover -s tests -v
```

### Nivel 2 — Test de integración del CLI (obligatorio para features de UI)

Las features que añaden comandos al CLI se verifican ejecutando el CLI real
contra un archivo temporal:

```python
import subprocess, tempfile, os
with tempfile.TemporaryDirectory() as d:
    env = {**os.environ, "NOTES_FILE": os.path.join(d, "notes.json")}
    out = subprocess.check_output(
        ["python3", "-m", "src.cli", "add", "hola", "--body", "mundo"],
        env=env, text=True,
    )
    assert "id=" in out
```

### Nivel 3 — Smoke test manual (opcional pero recomendado)

Antes de cerrar la sesión, ejecuta un flujo end-to-end con un archivo
temporal en `/tmp`:

```bash
NOTES_FILE=/tmp/notes_demo.json python3 -m src.cli add "test" --body "x"
NOTES_FILE=/tmp/notes_demo.json python3 -m src.cli list
rm /tmp/notes_demo.json
```

### Nivel 4 — Trazabilidad de escenarios (obligatorio para features con `"sdd": true`)

Cada escenario `@s` de `features/<name>.feature` debe poder mapearse a al
menos un test concreto en `tests/`. El `judge` rechaza si falta cobertura.

El `tdd_craftsman` documenta el mapa en `progress/tdd_<name>.md`:

```markdown
## Trazabilidad
- @s1 (archivo vacío → 0) → test_count_archivo_vacio
- @s2 (varias notas → 3)  → test_count_varias_notas
- @s3 (no muta el archivo) → test_count_no_muta_archivo
```

### Nivel 5 — Prueba de mutación (obligatorio para cerrar una feature sdd)

Una suite verde no basta: hay que demostrar que los tests **muerden**. El
`mutation_tester` corre el mutador y exige el umbral de
`docs/mutation-testing.md`:

```bash
python3 tools/mutate.py src/cli.py
```

Todo mutante sobreviviente se mata con un test nuevo o se justifica como
equivalente en `progress/mutation_<name>.md`.

## Anti-patrones (no hacer)

- ❌ "He añadido el comando, debería funcionar." → falta test ejecutable.
- ❌ Test que solo verifica que la función no lanza excepción. → tiene que
  comprobar el resultado concreto.
- ❌ `mock` del filesystem. → usa `tempfile.TemporaryDirectory()` real.
- ❌ Marcar la feature como `done` sin pasar `./init.sh`.

## Verificación final antes de cerrar

```bash
./init.sh                       # debe terminar con [OK] Entorno listo
python3 tools/mutate.py src/cli.py   # score por encima del umbral
```

Si `./init.sh` está rojo o sobreviven mutantes sin justificar, **no**
marques nada como `done`. Anota el bloqueo en `progress/current.md` con
estado `blocked` en `feature_list.json`.
