# Adaptador: Go

Mapea el arnés a un proyecto Go. El runner de tests es la stdlib (`go test`);
la mutación necesita una herramienta externa (Go no trae mutador). Ver también
la receta de `docs/configuration.md` y el adaptador `generic.md`.

## `harness.config.json`

```json
{
  "language": "go",
  "commands": {
    "lint": "go vet ./...",
    "test": "go test ./...",
    "mutate": "gremlins unleash {{target}} --dry-run=false"
  },
  "paths": { "src": ".", "tests": "." },
  "mutation": { "threshold": 1.0, "targets": ["./..."] }
}
```

- `go test ./...` sale con código 0 **solo** si todos los tests pasan: cumple el
  contrato de `commands.test`.
- No hay `{{py}}`/intérprete que resolver: el toolchain de Go es un binario.
- `{{target}}` lo sustituye el motor por cada entrada de `mutation.targets`.
  A diferencia de Python/Node (mutación por fichero), en Go **gremlins muta por
  paquete/módulo**, así que los `targets` son rutas de paquete (`./...`,
  `./pkg/notes`), no ficheros sueltos.

## Layout típico

Go **coloca los tests junto al código**, no en un `tests/` aparte:

```
go.mod
pkg/notes/notes.go      pkg/notes/notes_test.go
pkg/storage/storage.go  pkg/storage/storage_test.go
cmd/notes/main.go
```

Por eso `paths.src` y `paths.tests` apuntan ambos a la raíz (o al paquete): el
arnés solo los usa para orientarse, y en Go fuente y test viven juntos.

## Mutación con gremlins

[gremlins](https://github.com/go-gremlins/gremlins) es el mutador de referencia
para Go. Se instala como binario y no toca tu `go.mod`:

```sh
go install github.com/go-gremlins/gremlins/cmd/gremlins@latest
```

El umbral se declara en `.gremlins.yaml` (junto al `go.mod`) para que
`gremlins unleash` salga con código **!= 0** cuando no se alcanza —así el motor
lo trata como fallo, igual que en los demás stacks:

```yaml
# .gremlins.yaml
thresholds:
  efficacy: 100   # % mínimo de mutantes muertos; el arnés exige 100 en los ejemplos
  mutant-coverage: 0
```

Alternativa: [go-mutesting](https://github.com/zimmski/go-mutesting), si
prefieres su catálogo de mutaciones (revisa su estado de mantenimiento y forks
antes de adoptarlo).

## Producción

- Añade `build` (`go build ./...`) y, si usas un linter más estricto,
  cambia `lint` a `golangci-lint run`.
- Para módulos con muchos paquetes, apunta `mutation.targets` a los paquetes de
  dominio y deja fuera `cmd/` y el pegamento de IO, igual que se acota en los
  ejemplos Python/Node.

## Si no quieres depender de gremlins

Puedes portar el mutador de los ejemplos (`examples/python-notes-cli/tools/mutate.py`
o `examples/node-notes-cli/tools/mutate.mjs`): ~200 líneas sin dependencias que
mutan operadores, palabras clave, números y `return`, validan que el mutante
compile (`go build`) y restauran el original. Es un buen punto de partida
mientras no exista un `examples/go-notes-cli` nativo.
