# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra.** Toda feature
> termina con evidencia ejecutable, no con afirmaciones. Los comandos
> concretos salen de `harness.config.json`; aquí van los niveles.

## Niveles de verificación

### Nivel 1 — Tests unitarios (obligatorio)

Toda función pública en `src/` tiene al menos un test que (1) cubre el camino
feliz y (2) cubre al menos un camino de error si la función puede fallar.

```bash
bin/harness test
```

### Nivel 2 — Test de integración de la interfaz (obligatorio para features de UI/CLI)

Las features que añaden comandos/pantallas se verifican ejecutando la interfaz
real contra un entorno aislado (directorio temporal, base de datos efímera…),
nunca con mocks del sistema de ficheros.

### Nivel 3 — Smoke test manual (recomendado)

Antes de cerrar, ejecuta un flujo end-to-end con datos desechables y límpialo.

### Nivel 4 — Trazabilidad de escenarios (obligatorio para features `"sdd": true`)

Cada escenario `@s` de `features/<name>.feature` mapea a al menos un test
concreto. El `judge` rechaza si falta cobertura. El mapa vive en
`progress/tdd_<name>.md`:

```markdown
## Trazabilidad
- @s1 (archivo vacío → 0) → test_count_archivo_vacio
- @s2 (varias notas → 3)  → test_count_varias_notas
- @s3 (no muta el archivo) → test_count_no_muta_archivo
```

### Nivel 5 — Prueba de mutación (obligatorio para cerrar una feature sdd)

Una suite verde no basta: hay que demostrar que los tests **muerden**.

```bash
bin/harness mutate
```

Todo mutante sobreviviente se mata con un test nuevo o se justifica como
equivalente en `progress/mutation_<name>.md`.

## Anti-patrones (no hacer)

- ❌ "He añadido el comando, debería funcionar." → falta test ejecutable.
- ❌ Test que solo verifica que la función no lanza excepción. → debe
  comprobar el resultado concreto.
- ❌ Mock del filesystem. → usa aislamiento real (directorio temporal).
- ❌ Marcar la feature como `done` sin pasar `bin/harness init`.

## Verificación final antes de cerrar

```bash
bin/harness verify     # init (entorno + tests) + prueba de mutación
```

Si `verify` está rojo o sobreviven mutantes sin justificar, **no** marques
nada como `done`. Anota el bloqueo en `progress/current.md` con estado
`blocked` en `feature_list.json`.
