// Mutador mínimo y sin dependencias para prueba de mutación en Go.
//
// Introduce un defecto pequeño en un archivo de `src/`, recompila y corre la
// suite (`go test ./...`) y comprueba si algún test falla (mutante MUERTO) o si
// todos pasan (mutante SOBREVIVIENTE). Un sobreviviente es un agujero en la red.
//
//	go run tools/mutate.go src/cli.go
//
// Diseño (espeja tools/mutate.py y tools/mutate.mjs de los otros ejemplos):
//   - Trabaja a nivel de *token* (go/scanner de la stdlib), así que NUNCA muta
//     el contenido de strings ni comentarios: solo operadores, enteros y las
//     constantes booleanas true/false.
//   - Descarta los mutantes que no compilan (`go build ./...`); no inflan el
//     score, igual que el filtro `compile()`/`--check` de los otros mutadores.
//   - Restaura SIEMPRE el archivo original (defer), incluso ante un fallo.
//   - Respeta el pragma de línea `// mutate: skip` para mutantes equivalentes,
//     con justificación explícita en el propio comentario.
//
// Ver docs/mutation-testing.md.
package main

import (
	"fmt"
	"go/scanner"
	"go/token"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

const skipPragma = "mutate: skip"

// Mutaciones de operador: token -> texto de reemplazo.
var opMutations = map[token.Token]string{
	token.EQL:  "!=",
	token.NEQ:  "==",
	token.LSS:  "<=",
	token.LEQ:  "<",
	token.GTR:  ">=",
	token.GEQ:  ">",
	token.ADD:  "-",
	token.SUB:  "+",
	token.LAND: "||",
	token.LOR:  "&&",
}

// Mutaciones de constante booleana.
var wordMutations = map[string]string{
	"true":  "false",
	"false": "true",
}

type mutant struct {
	offset int
	length int
	orig   string
	repl   string
	label  string
	line   int
}

func (m mutant) describe(path string) string {
	return fmt.Sprintf("%s:%d  %s  (%q -> %q)", path, m.line, m.label, m.orig, m.repl)
}

func (m mutant) apply(src []byte) []byte {
	out := make([]byte, 0, len(src)-m.length+len(m.repl))
	out = append(out, src[:m.offset]...)
	out = append(out, m.repl...)
	out = append(out, src[m.offset+m.length:]...)
	return out
}

// intMutation devuelve n+1 para un entero decimal simple. Ignora octales/hex
// (prefijo 0x/0o/0 con más dígitos) y cualquier cosa que no sea decimal puro.
func intMutation(lit string) (string, bool) {
	if len(lit) > 1 && lit[0] == '0' {
		return "", false // 0x.., 0o.., 0b.., 0644...: no tocar
	}
	for _, c := range lit {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	n, err := strconv.Atoi(lit)
	if err != nil {
		return "", false
	}
	return strconv.Itoa(n + 1), true
}

func generateMutants(path string, src []byte) []mutant {
	fset := token.NewFileSet()
	file := fset.AddFile(path, fset.Base(), len(src))
	var s scanner.Scanner
	s.Init(file, src, nil, 0) // mode 0: no emite comentarios como tokens
	srcLines := strings.Split(string(src), "\n")

	var mutants []mutant
	for {
		pos, tok, lit := s.Scan()
		if tok == token.EOF {
			break
		}
		line := file.Line(pos)
		if line-1 < len(srcLines) && strings.Contains(srcLines[line-1], skipPragma) {
			continue
		}
		offset := file.Offset(pos)
		if repl, ok := opMutations[tok]; ok {
			text := tok.String()
			mutants = append(mutants, mutant{offset, len(text), text, repl, "operador", line})
		} else if tok == token.INT {
			if repl, ok := intMutation(lit); ok {
				mutants = append(mutants, mutant{offset, len(lit), lit, repl, "número", line})
			}
		} else if tok == token.IDENT {
			if repl, ok := wordMutations[lit]; ok {
				mutants = append(mutants, mutant{offset, len(lit), lit, repl, "palabra", line})
			}
		}
	}
	return mutants
}

// runGo ejecuta `go <args...>` en silencio y devuelve su código de salida.
func runGo(args ...string) int {
	cmd := exec.Command("go", args...)
	if err := cmd.Run(); err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return ee.ExitCode()
		}
		return 1
	}
	return 0
}

func compiles() bool  { return runGo("build", "./...") == 0 }
func testsPass() bool { return runGo("test", "./...") == 0 }

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "uso: go run tools/mutate.go <archivo.go>")
		os.Exit(2)
	}
	path := os.Args[1]

	original, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "no pude leer %s: %v\n", path, err)
		os.Exit(2)
	}

	// Cordura: la suite debe estar VERDE antes de mutar.
	if !testsPass() {
		fmt.Fprintln(os.Stderr, "[FAIL] La suite está roja sin mutar. Arregla los tests primero.")
		os.Exit(2)
	}

	// Restauración garantizada del original pase lo que pase.
	restore := func() { _ = os.WriteFile(path, original, 0o644) }
	defer restore()

	candidates := generateMutants(path, original)

	var valid, killed, survived []mutant
	skippedNonCompile := 0

	// Primer filtro: descartar los que no compilan (no inflan el score).
	for _, m := range candidates {
		if err := os.WriteFile(path, m.apply(original), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "no pude escribir el mutante: %v\n", err)
			os.Exit(2)
		}
		if compiles() {
			valid = append(valid, m)
		} else {
			skippedNonCompile++
		}
	}
	restore()

	fmt.Printf("── Mutando %s ─ %d mutantes válidos (%d descartados por no compilar)\n",
		path, len(valid), skippedNonCompile)

	for i, m := range valid {
		if err := os.WriteFile(path, m.apply(original), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "no pude escribir el mutante: %v\n", err)
			os.Exit(2)
		}
		alive := testsPass()
		mark := "muerto"
		if alive {
			survived = append(survived, m)
			mark = "SOBREVIVE"
		} else {
			killed = append(killed, m)
		}
		fmt.Printf("  [%d/%d] %-9s %s\n", i+1, len(valid), mark, m.describe(path))
	}
	restore()

	total := len(valid)
	score := 100.0
	if total > 0 {
		score = float64(len(killed)) / float64(total) * 100
	}

	fmt.Println("\n── Resumen ──────────────────────────────────────")
	fmt.Printf("  total:    %d\n", total)
	fmt.Printf("  killed:   %d\n", len(killed))
	fmt.Printf("  survived: %d\n", len(survived))
	fmt.Printf("  score:    %.1f%%\n", score)
	if len(survived) > 0 {
		fmt.Println("\n  Mutantes sobrevivientes (agujeros en la red):")
		for _, m := range survived {
			fmt.Printf("   - %s\n", m.describe(path))
		}
	}

	if len(survived) > 0 {
		os.Exit(1)
	}
}
