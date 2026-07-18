package src

import (
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"time"
)

const (
	defaultPath        = ".notes.json"
	dateLayout         = "2006-01-02"
	defaultRecentLimit = 5
)

// notesPath resuelve el archivo de notas: la variable de entorno NOTES_FILE si
// está definida, o `.notes.json` por defecto. Se lee en cada llamada para que
// los tests puedan apuntar a un archivo temporal por caso.
func notesPath() string {
	if p := os.Getenv("NOTES_FILE"); p != "" {
		return p
	}
	return defaultPath
}

// printLines imprime cada nota en el formato compartido por list/recent/since:
// `<id>\t<created_at>\t<title>`. Un único contrato de presentación.
func printLines(out io.Writer, notes []Note) {
	for _, n := range notes {
		fmt.Fprintf(out, "%d\t%s\t%s\n", n.ID, n.CreatedAt, n.Title)
	}
}

// byCreatedAtDesc ordena las notas de más reciente a más antigua, in place.
func byCreatedAtDesc(notes []Note) {
	sort.SliceStable(notes, func(i, j int) bool {
		// Orden estricto sobre claves distintas: '>' y '>=' dan el mismo
		// resultado, luego mutar este operador es un mutante equivalente.
		return notes[i].CreatedAt > notes[j].CreatedAt // mutate: skip
	})
}

func cmdAdd(rest []string, out, errw io.Writer, path string, now time.Time) int {
	if len(rest) == 0 {
		fmt.Fprintln(errw, "add requiere un título")
		return 1
	}
	existing, err := Load(path)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	note := New(rest[0], "", existing, now)
	existing = append(existing, note)
	if err := Save(existing, path); err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	fmt.Fprintf(out, "id=%d\n", note.ID)
	return 0
}

func cmdList(out, errw io.Writer, path string) int {
	notes, err := Load(path)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	printLines(out, notes)
	return 0
}

func cmdCount(out, errw io.Writer, path string) int {
	notes, err := Load(path)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	fmt.Fprintf(out, "%d\n", len(notes))
	return 0
}

func cmdRecent(rest []string, out, errw io.Writer, path string) int {
	limit := defaultRecentLimit
	if len(rest) != 0 {
		if rest[0] != "--limit" {
			fmt.Fprintf(errw, "argumento desconocido: %q\n", rest[0])
			return 1
		}
		if len(rest) == 1 {
			fmt.Fprintln(errw, "--limit requiere un valor")
			return 1
		}
		v, err := strconv.Atoi(rest[1])
		if err != nil {
			fmt.Fprintln(errw, "--limit debe ser un entero")
			return 1
		}
		limit = v
	}
	if limit <= 0 {
		fmt.Fprintln(errw, "--limit debe ser un entero positivo")
		return 1
	}
	notes, err := Load(path)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	byCreatedAtDesc(notes)
	notes = notes[:min(len(notes), limit)]
	printLines(out, notes)
	return 0
}

func cmdSince(rest []string, out, errw io.Writer, path string) int {
	if len(rest) == 0 {
		fmt.Fprintln(errw, "since requiere una fecha YYYY-MM-DD")
		return 1
	}
	date := rest[0]
	if _, err := time.Parse(dateLayout, date); err != nil {
		fmt.Fprintf(errw, "fecha inválida: %q (formato esperado YYYY-MM-DD)\n", date)
		return 1
	}
	notes, err := Load(path)
	if err != nil {
		fmt.Fprintln(errw, err)
		return 1
	}
	var matches []Note
	for _, n := range notes {
		if n.CreatedAt[:len(date)] >= date {
			matches = append(matches, n)
		}
	}
	byCreatedAtDesc(matches)
	printLines(out, matches)
	return 0
}

// Run despacha el subcomando y devuelve el código de salida. Recibe los flujos
// de salida/error como parámetros para poder capturarlos en los tests sin
// tocar os.Stdout/os.Stderr globales.
func Run(args []string, out, errw io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(errw, "uso: notes <add|list|count|recent|since> ...")
		return 1
	}
	path := notesPath()
	rest := args[1:]
	switch args[0] {
	case "add":
		return cmdAdd(rest, out, errw, path, time.Now())
	case "list":
		return cmdList(out, errw, path)
	case "count":
		return cmdCount(out, errw, path)
	case "recent":
		return cmdRecent(rest, out, errw, path)
	case "since":
		return cmdSince(rest, out, errw, path)
	default:
		fmt.Fprintf(errw, "comando desconocido: %q\n", args[0])
		return 1
	}
}
