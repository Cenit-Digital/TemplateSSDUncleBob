# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra**.
> Toda feature termina con evidencia ejecutable, no con afirmaciones.

> Los comandos concretos dependen del stack. Aquí van los cinco **niveles**
> (que no cambian) y, en cada uno, un recuadro "Referencia: Python" con el
> comando exacto del stack por defecto. Para otro lenguaje, sustituye los
> comandos según `docs/stack-adapter.md`.

## Niveles de verificación

### Nivel 1 — Tests unitarios (obligatorio)

Toda función pública en `src/` tiene al menos un test en `tests/` que:

1. Cubre el camino feliz.
2. Cubre al menos un camino de error si la función puede fallar.

> **Referencia: Python**
> ```bash
> python3 -m unittest discover -s tests -v
> ```

### Nivel 2 — Test de integración de la interfaz (obligatorio para features de UI/CLI/API)

Las features que añaden comandos o endpoints se verifican ejecutando la
**interfaz real** contra un recurso temporal real, no contra mocks.

> **Referencia: Python** (CLI contra un archivo temporal)
> ```python
> import subprocess, tempfile, os
> with tempfile.TemporaryDirectory() as d:
>     env = {**os.environ, "NOTES_FILE": os.path.join(d, "notes.json")}
>     out = subprocess.check_output(
>         ["python3", "-m", "src.cli", "add", "hola", "--body", "mundo"],
>         env=env, text=True,
>     )
>     assert "id=" in out
> ```

### Nivel 3 — Smoke test manual (opcional pero recomendado)

Antes de cerrar la sesión, ejecuta un flujo end-to-end con un recurso
temporal descartable.

> **Referencia: Python**
> ```bash
> NOTES_FILE=/tmp/notes_demo.json python3 -m src.cli add "test" --body "x"
> NOTES_FILE=/tmp/notes_demo.json python3 -m src.cli list
> rm /tmp/notes_demo.json
> ```

### Nivel 4 — Trazabilidad de escenarios (obligatorio para features con `"sdd": true`)

Cada escenario `@s` de `features/<name>.feature` debe poder mapearse a al
menos un test concreto en `tests/`. El `judge` rechaza si falta cobertura.

El `tdd_craftsman` documenta el mapa en `progress/tdd_<name>.md`:

```markdown
## Trazabilidad
- @s1 (caso vacío → 0)       → test_<accion>_caso_vacio
- @s2 (varios elementos → n) → test_<accion>_varios
- @s3 (no muta el estado)    → test_<accion>_no_muta
```

### Nivel 5 — Prueba de mutación (obligatorio para cerrar una feature sdd)

Una suite verde no basta: hay que demostrar que los tests **muerden**. El
`mutation_tester` corre el mutador y exige el umbral de
`docs/mutation-testing.md`. Todo mutante sobreviviente se mata con un test
nuevo o se justifica como equivalente en `progress/mutation_<name>.md`.

> **Referencia: Python**
> ```bash
> python3 tools/mutate.py src/cli.py
> ```
> Para JS/TS sería `npx stryker run`; para otros stacks, ver
> `docs/stack-adapter.md`.

## Anti-patrones (no hacer)

- ❌ "He añadido el comando, debería funcionar." → falta test ejecutable.
- ❌ Test que solo verifica que la función no lanza excepción. → tiene que
  comprobar el resultado concreto.
- ❌ Mockear el sistema de archivos. → usa un directorio temporal real.
- ❌ Marcar la feature como `done` sin que `./init.sh` pase en verde.

## Verificación final antes de cerrar

> **Referencia: Python**
> ```bash
> ./init.sh                            # debe terminar con [OK] Entorno listo
> python3 tools/mutate.py src/cli.py   # score por encima del umbral
> ```

Si `./init.sh` está rojo o sobreviven mutantes sin justificar, **no**
marques nada como `done`. Anota el bloqueo en `progress/current.md` con
estado `blocked` en `feature_list.json`.
