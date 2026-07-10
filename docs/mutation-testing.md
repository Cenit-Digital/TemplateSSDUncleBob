# Prueba de mutación — validar que los tests muerden

> La prueba de mutación es cara en cómputo, pero el retorno en corrección del
> código compensa cada ciclo. Estamos pasando de un cuello de botella marcado
> por lo rápido que teclea un humano a uno marcado por cuánta validación
> puede pagar la CPU. (Estas frases son consignas del método en la
> formulación de BettaTech, no citas textuales de Robert C. Martin; su
> posición **verificada** es que la prueba de mutación mide la *estabilidad
> semántica* de una suite de tests — artículo de 2016.)

## El problema que resuelve

Una suite verde dice "el código no explota con estas entradas". **No** dice
"los tests fallarían si el código estuviera mal". Un test sin asserts
fuertes pasa siempre y no protege nada.

La prueba de mutación lo mide al revés: introduce un defecto pequeño en el
código (un *mutante*) y observa la suite.

- Si **algún test falla** → el mutante está **muerto** (killed). Bien: la
  red atrapó el defecto.
- Si **todos los tests pasan** → el mutante **sobrevive** (survived). Mal:
  hay un agujero. Falta un assert o un caso.

**Puntuación de mutación** = `killed / total`. Cuanto más alta, más muerden
los tests.

## El mutador de referencia: `tools/mutate.py`

Para el stack de referencia (Python) la plantilla incluye un mutador sin
dependencias externas (así `requirements.txt` sigue vacío). El script:

1. Lee un archivo de `src/`.
2. Aplica, **uno a uno**, un catálogo de mutaciones a nivel de *token*
   (usa `tokenize`, por lo que nunca muta el contenido de strings ni
   comentarios: solo operadores, palabras clave, números y `return`):

   | Categoría    | Ejemplo de mutación                          |
   |--------------|----------------------------------------------|
   | Comparación  | `<=` → `<`, `==` → `!=`, `>` → `>=`          |
   | Aritmética   | `+` → `-`, `- 1` → `+ 1`                      |
   | Booleano     | `and` → `or`, `True` → `False`               |
   | Constantes   | `0` → `1`, `1` → `0`                          |
   | Retorno      | `return <expr>` → `return None`              |

3. Por cada mutante: escribe el archivo mutado, corre la suite de tests,
   restaura el original. Descarta los mutantes que no compilan (no inflan la
   puntuación).
4. Reporta `total`, `killed`, `survived`, `score` y la lista de
   sobrevivientes (archivo:línea + mutación).

```bash
python3 tools/mutate.py src/cli.py            # mutar un archivo
python3 tools/mutate.py src/cli.py --max 80   # acotar nº de mutantes
```

El script **restaura siempre** el archivo original, incluso si lo
interrumpes con Ctrl-C (maneja la limpieza en `finally`).

> **Compatibilidad Windows.** El mutador lee y reescribe cada archivo con
> codificación **UTF-8 explícita**, de modo que funciona igual en Windows
> (donde la codificación por defecto de Python no es UTF-8) que en
> Linux/macOS. Sin esto, un archivo con acentos o símbolos podría corromperse
> al restaurarlo.

## El umbral

- Por defecto, la feature exige **100% de mutantes muertos sobre las líneas
  nuevas o tocadas** por esa feature.
- Para código heredado no tocado por la feature, no se exige umbral (se
  mide, no se bloquea).
- Un mutante **equivalente** (no cambia el comportamiento observable; p. ej.
  mutar un valor que nunca se usa) puede excluirse, pero **solo** con
  justificación explícita escrita en `progress/mutation_<name>.md`. Abusar
  de esta vía es hacer trampa al juez.

## Quién hace qué

- El `mutation_tester` **mide** y reporta. No edita código.
- Un mutante sobreviviente es trabajo del `tdd_craftsman`: escribe el test
  rojo que lo mata y vuelve a pasar por el `judge`. Es el ciclo de mejora
  compute-bound: la CPU encuentra el hueco, el artesano lo tapa con un test.

## Otros lenguajes

El *concepto* es universal; solo cambia la herramienta que introduce los
mutantes. Enchufa el mutador de tu stack en `docs/stack-adapter.md`:

- **Python** — `tools/mutate.py` (incluido, sin dependencias) o mutadores
  dedicados como `mutmut` o `cosmic-ray`.
- **JavaScript / TypeScript** — **Stryker** (`npx stryker run`), el estándar
  de facto para mutación en JS/TS.
- **Otros lenguajes** — usa el mutador que exista para tu ecosistema (p. ej.
  PIT/Pitest en la JVM, Stryker.NET en .NET). Si no hay ninguno viable, mide
  al menos manualmente sobre las líneas críticas y documenta el criterio.

## Por qué vale el coste

Reejecutar toda la suite por cada mutante es caro. Pero ese es justo el
desplazamiento que describe el método: el límite ya no es lo rápido que
teclea un humano, sino cuánta validación puede pagar tu CPU. La corrección
del código es el retorno, y compensa cada ciclo.
