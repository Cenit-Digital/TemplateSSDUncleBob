# TDD estricto — la disciplina del `tdd_craftsman`

> ¿Se escriben todos los tests por delante y luego el código, o un test
> seguido de su código? La respuesta de este método: **single test followed
> by code**. Un test a la vez. Nunca toda la batería por delante.

## Las Tres Leyes del TDD

Tal como las formula Robert C. Martin
(blog.cleancoder.com/uncle-bob/2014/12/17/TheCyclesOfTDD.html):

1. **No escribes código de producción** salvo para hacer pasar un test que
   está fallando.
2. **No escribes más de un test del necesario para fallar** — y que no
   compile o no importe cuenta como fallar.
3. **No escribes más código de producción del necesario** para pasar el
   único test que falla.

El efecto: nunca tienes código sin un test que lo justifique, ni un test
que no esté empujando código real. El alcance no se infla.

## El ciclo, en pequeño y repetido

```
   ┌──────────────────────────────────────────────┐
   │                                                │
   ▼                                                │
 ROJO            VERDE                 REFACTOR      │
 escribe UN  →   mínimo código    →    limpia con   ─┘
 test que        para ponerlo          la barra
 falla           verde                 verde
```

- **ROJO** — el test deriva del siguiente escenario `@s` del `.feature`.
  Verifícalo fallando de verdad, corriendo la suite (el comando concreto
  depende del stack: ver `docs/stack-adapter.md`; en la referencia Python es
  `python3 -m unittest discover -s tests -v`). Un test que pasa a la primera
  no demuestra nada: ajústalo o sospecha del montaje.
- **VERDE** — la implementación **mínima**. Está permitido hacer trampa
  (devolver una constante) si aún no hay test que lo desmienta. El
  siguiente ciclo forzará la generalización. Esto es deliberado.
- **REFACTOR** — solo en verde. Elimina duplicación, mejora nombres,
  parte funciones largas. Vuelve a correr los tests tras cada cambio. Si
  algo se pone rojo, no estás refactorizando: estás cambiando comportamiento.

## Granularidad: un escenario, uno o más ciclos

Cada `@s` del `.feature` se traduce en al menos un ciclo Rojo-Verde-
Refactor. Un escenario con varias aristas (p. ej. "el caso vacío devuelve 0"
y "el caso con tres elementos devuelve 3") puede necesitar dos ciclos para
forzar la generalización del código.

## Trazabilidad obligatoria

Al cerrar, cada `@s` debe estar cubierto por al menos un test concreto. El
`tdd_craftsman` escribe el mapa en `progress/tdd_<name>.md` con este formato:

```markdown
## Trazabilidad
- @s1 (caso vacío → 0)        → test_<accion>_caso_vacio
- @s2 (varios elementos → n)  → test_<accion>_varios
- @s3 (no muta el estado)     → test_<accion>_no_muta
```

> **Ejemplo (`examples/notes-cli`).** Para la feature `cli_count`, el mapa
> real es:
> ```markdown
> - @s1 (archivo vacío → 0)       → test_count_archivo_vacio
> - @s2 (tres notas → 3)          → test_count_varias_notas
> - @s3 (no modifica el archivo)  → test_count_no_muta_archivo
> ```

El `judge` rechaza si algún `@s` queda sin test, y el `mutation_tester`
rechaza si los tests existen pero no muerden.

## Olores que el `judge` busca

- Código de producción que **ningún test rojo** pidió (viola la Ley 1).
- Tests escritos "a futuro" para escenarios que aún no toca.
- Refactors hechos en rojo.
- Funciones largas o nombres opacos que sobrevivieron al paso REFACTOR.
