# Adaptador: Java

Mapea el arnés a un proyecto Java. El runner de tests es Maven (`mvn test`,
que delega en JUnit vía Surefire); la mutación necesita una herramienta externa
(Java no trae mutador). Ver también la receta de `docs/configuration.md` y el
adaptador `generic.md`.

## `harness.config.json`

```json
{
  "language": "java",
  "commands": {
    "lint": "mvn -q checkstyle:check",
    "test": "mvn -q test",
    "mutate": "mvn -q org.pitest:pitest-maven:mutationCoverage -DtargetClasses={{target}}"
  },
  "paths": { "src": "src/main/java", "tests": "src/test/java" },
  "mutation": { "threshold": 1.0, "targets": ["com.example.notes.*"] }
}
```

- `mvn test` sale con código 0 **solo** si compila y todos los tests pasan
  (Surefire falla la build ante cualquier test rojo): cumple el contrato de
  `commands.test`.
- No hay `{{py}}`/intérprete que resolver: el toolchain de Java es un binario
  (`mvn` + JDK). A diferencia de gremlins (Go) o cargo-mutants (Rust), que son
  binarios sueltos, **PIT se integra como plugin de Maven**: no se instala
  aparte, se declara en el `pom.xml` (ver abajo).
- `{{target}}` lo sustituye el motor por cada entrada de `mutation.targets`.
  PIT **muta por clase**, seleccionadas con un glob de nombres cualificados, así
  que los `targets` son globs de clases/paquete (`com.example.notes.*`), no
  rutas de fichero como en Python/Node.

## Layout típico

Maven impone el layout estándar: fuente y test **separados** bajo `src/`, con el
árbol de paquetes replicado en ambos:

```
pom.xml
src/main/java/com/example/notes/Notes.java
src/main/java/com/example/notes/Storage.java
src/main/java/com/example/notes/Cli.java
src/test/java/com/example/notes/NotesTest.java
src/test/java/com/example/notes/StorageTest.java
```

Por eso `paths.src` apunta a `src/main/java` y `paths.tests` a `src/test/java`:
el arnés solo los usa para orientarse. (Gradle usa el mismo layout `src/main` /
`src/test`; ver la alternativa más abajo.)

## Mutación con PIT (pitest)

[PIT](https://pitest.org/) es el mutador de referencia para la JVM. No se
instala como binario: se declara como plugin en el `pom.xml`, de modo que
`mvn org.pitest:pitest-maven:mutationCoverage` lo ejecuta sobre el bytecode ya
compilado (por eso es rápido).

El umbral se declara en la config del plugin para que la build salga con código
**!= 0** cuando no se alcanza —así el motor lo trata como fallo, igual que en
los demás stacks:

```xml
<!-- pom.xml, dentro de <build><plugins> -->
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.15.8</version>
  <configuration>
    <targetClasses><param>com.example.notes.*</param></targetClasses>
    <targetTests><param>com.example.notes.*Test</param></targetTests>
    <mutationThreshold>100</mutationThreshold> <!-- % mínimo de mutantes muertos -->
  </configuration>
  <dependencies>
    <!-- necesario si usas JUnit 5 -->
    <dependency>
      <groupId>org.pitest</groupId>
      <artifactId>pitest-junit5-plugin</artifactId>
      <version>1.2.1</version>
    </dependency>
  </dependencies>
</plugin>
```

`mutationThreshold` es el análogo directo del `threshold: 1.0` del arnés:
ponlo en `100` y la build falla si sobrevive un solo mutante. La bandera
`-DtargetClasses={{target}}` en `commands.mutate` sobreescribe por CLI el glob
del `pom.xml`, permitiendo al motor acotar la mutación clase a clase.

Si un mutante es **equivalente** (no observable por ningún test posible), no
bajes el listón: exclúyelo con los filtros nativos de PIT en la config del
plugin —el análogo del pragma `// mutate: skip` del ejemplo Node— y documenta
por qué:

```xml
<excludedMethods><param>toString</param></excludedMethods>
<excludedClasses><param>com.example.notes.Cli</param></excludedClasses>
```

También existe la extensión opcional `pitest-annotations` (`@DoNotMutate` /
`@CoverageIgnore`) si prefieres marcar la exclusión en el propio código en vez
de en el `pom.xml`.

## Producción

- Añade `build` (`mvn -q -DskipTests package`) y mantén `lint` con Checkstyle,
  SpotBugs o `mvn compile -Dmaven.compiler.failOnWarning=true` para que los
  avisos rompan la build.
- Para proyectos multi-módulo, apunta `mutation.targets` a los paquetes de
  dominio y deja fuera la capa de IO/arranque (`*.Cli`, `*.Main`), igual que se
  acota en los ejemplos Python/Node.
- PIT acelera con `<threads>N</threads>` y con análisis incremental
  (`withHistory`), útil cuando la suite es lenta.

## Alternativa: Gradle

Si usas Gradle en vez de Maven, el plugin
[`info.solidsoft.pitest`](https://github.com/szpak/gradle-pitest-plugin) expone
la misma capacidad; los comandos quedarían:

```json
{
  "commands": {
    "test": "gradle test",
    "mutate": "gradle pitest -Ppitest.targetClasses={{target}}"
  }
}
```

El umbral se declara con `mutationThreshold = 100` en el bloque `pitest { … }`
del `build.gradle`.

## Si no quieres depender de PIT

PIT es maduro y es el estándar de facto en la JVM, así que rara vez compensa
prescindir de él. Aun así puedes portar el mutador de los ejemplos
(`examples/python-notes-cli/tools/mutate.py` o
`examples/node-notes-cli/tools/mutate.mjs`): ~200 líneas sin dependencias que
mutan operadores, palabras clave, números y `return`. En Java el paso de
"validar que el mutante compila" implica invocar `javac` con el classpath del
proyecto (más pesado que el `node --check` de Node), por lo que PIT —que trabaja
sobre bytecode ya compilado— suele ser la mejor opción.
