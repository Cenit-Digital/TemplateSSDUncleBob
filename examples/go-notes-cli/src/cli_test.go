package src

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newStore devuelve la ruta de un almacén temporal y la fija en NOTES_FILE.
// El archivo NO se crea todavía: un almacén inexistente cuenta como vacío.
func newStore(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "notas.json")
	t.Setenv("NOTES_FILE", path)
	return path
}

// seed escribe notas directamente como JSON (sin pasar por Save) para que el
// sembrado sea independiente de la capa que a veces se está mutando.
func seed(t *testing.T, path string, notes []Note) {
	t.Helper()
	data, err := json.Marshal(notes)
	if err != nil {
		t.Fatalf("no pude serializar el sembrado: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("no pude escribir el sembrado: %v", err)
	}
}

func run(t *testing.T, args ...string) (int, string, string) {
	t.Helper()
	var out, errb bytes.Buffer
	code := Run(args, &out, &errb)
	return code, out.String(), errb.String()
}

func lines(s string) []string {
	s = strings.TrimRight(s, "\n")
	if s == "" {
		return nil
	}
	return strings.Split(s, "\n")
}

func note(id int, date, title string) Note {
	return Note{ID: id, Title: title, Body: "", CreatedAt: date + "T10:00:00Z"}
}

// ---- Run (dispatcher) ------------------------------------------------------

func TestRunNoArgs(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t)
	if code != 1 {
		t.Fatalf("sin subcomando el código debe ser 1")
	}
	if !strings.Contains(errOut, "uso:") {
		t.Fatalf("esperaba mensaje de uso, obtuve %q", errOut)
	}
}

func TestRunUnknownCommand(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "bogus")
	if code != 1 || !strings.Contains(errOut, "desconocido") {
		t.Fatalf("comando desconocido debe fallar con mensaje, code=%d err=%q", code, errOut)
	}
}

// ---- count -----------------------------------------------------------------

func TestCountEmptyStore(t *testing.T) {
	newStore(t)
	code, out, _ := run(t, "count")
	if code != 0 || out != "0\n" {
		t.Fatalf("count vacío esperaba \"0\" y code 0, obtuve code=%d out=%q", code, out)
	}
}

func TestCountThreeNotes(t *testing.T) {
	path := newStore(t)
	seed(t, path, []Note{note(1, "2026-05-01", "a"), note(2, "2026-05-02", "b"), note(3, "2026-05-03", "c")})
	code, out, _ := run(t, "count")
	if code != 0 || out != "3\n" {
		t.Fatalf("count esperaba \"3\" y code 0, obtuve code=%d out=%q", code, out)
	}
}

// ---- add / list ------------------------------------------------------------

func TestAddOnEmptyStoreGetsIDOne(t *testing.T) {
	newStore(t)
	code, out, _ := run(t, "add", "hola")
	if code != 0 || out != "id=1\n" {
		t.Fatalf("primer add esperaba \"id=1\" code 0, obtuve code=%d out=%q", code, out)
	}
	code, out, _ = run(t, "count")
	if code != 0 || out != "1\n" {
		t.Fatalf("tras add, count esperaba \"1\", obtuve code=%d out=%q", code, out)
	}
}

func TestAddIsSequential(t *testing.T) {
	newStore(t)
	run(t, "add", "primera")
	code, out, _ := run(t, "add", "segunda")
	if code != 0 || out != "id=2\n" {
		t.Fatalf("segundo add esperaba \"id=2\", obtuve code=%d out=%q", code, out)
	}
}

func TestAddRequiresTitle(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "add")
	if code != 1 || !strings.Contains(errOut, "título") {
		t.Fatalf("add sin título debe fallar con mensaje, code=%d err=%q", code, errOut)
	}
}

func TestListFormat(t *testing.T) {
	path := newStore(t)
	seed(t, path, []Note{note(1, "2026-05-01", "alfa"), note(2, "2026-05-02", "beta")})
	code, out, _ := run(t, "list")
	if code != 0 {
		t.Fatalf("list code esperado 0, obtuve %d", code)
	}
	got := lines(out)
	want := []string{"1\t2026-05-01T10:00:00Z\talfa", "2\t2026-05-02T10:00:00Z\tbeta"}
	if len(got) != len(want) {
		t.Fatalf("esperaba %d líneas, obtuve %d: %q", len(want), len(got), out)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("línea %d: esperaba %q, obtuve %q", i, want[i], got[i])
		}
	}
}

// ---- recent ----------------------------------------------------------------

func manyNotes(n int) []Note {
	notes := make([]Note, 0, n)
	for i := 1; i <= n; i++ {
		day := "2026-05-0" + string(rune('0'+i)) // i in 1..9 -> 2026-05-0i
		notes = append(notes, note(i, day, "t"+string(rune('0'+i))))
	}
	return notes
}

func TestRecentDefaultCapsAtFive(t *testing.T) {
	path := newStore(t)
	seed(t, path, manyNotes(7))
	code, out, _ := run(t, "recent")
	if code != 0 {
		t.Fatalf("recent code esperado 0, obtuve %d", code)
	}
	got := lines(out)
	if len(got) != 5 {
		t.Fatalf("recent por defecto debe mostrar 5, obtuve %d: %q", len(got), out)
	}
	// Más reciente primero: la nota 7 (2026-05-07) encabeza.
	if !strings.HasPrefix(got[0], "7\t2026-05-07T10:00:00Z") {
		t.Fatalf("primera línea debe ser la más reciente (id 7), obtuve %q", got[0])
	}
	// La quinta y última mostrada es la nota 3 (7,6,5,4,3).
	if !strings.HasPrefix(got[4], "3\t2026-05-03T10:00:00Z") {
		t.Fatalf("quinta línea esperada id 3, obtuve %q", got[4])
	}
}

func TestRecentDescendingOrder(t *testing.T) {
	path := newStore(t)
	seed(t, path, []Note{note(1, "2026-05-01", "a"), note(2, "2026-05-03", "c"), note(3, "2026-05-02", "b")})
	_, out, _ := run(t, "recent")
	got := lines(out)
	if len(got) != 3 {
		t.Fatalf("esperaba 3 líneas, obtuve %d", len(got))
	}
	if !strings.HasPrefix(got[0], "2\t2026-05-03") || !strings.HasPrefix(got[2], "1\t2026-05-01") {
		t.Fatalf("orden descendente incorrecto: %q", out)
	}
}

func TestRecentCustomLimit(t *testing.T) {
	path := newStore(t)
	seed(t, path, manyNotes(4))
	code, out, _ := run(t, "recent", "--limit", "2")
	if code != 0 {
		t.Fatalf("recent --limit 2 code esperado 0, obtuve %d", code)
	}
	if got := lines(out); len(got) != 2 {
		t.Fatalf("recent --limit 2 esperaba 2 líneas, obtuve %d: %q", len(got), out)
	}
}

func TestRecentLimitOneSucceeds(t *testing.T) {
	path := newStore(t)
	seed(t, path, manyNotes(3))
	code, out, _ := run(t, "recent", "--limit", "1")
	if code != 0 || len(lines(out)) != 1 {
		t.Fatalf("recent --limit 1 esperaba 1 línea y code 0, obtuve code=%d out=%q", code, out)
	}
}

func TestRecentLimitZeroFails(t *testing.T) {
	path := newStore(t)
	seed(t, path, manyNotes(3))
	code, _, errOut := run(t, "recent", "--limit", "0")
	if code != 1 || !strings.Contains(errOut, "positivo") {
		t.Fatalf("recent --limit 0 debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestRecentLimitMissingValueFails(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "recent", "--limit")
	if code != 1 || !strings.Contains(errOut, "valor") {
		t.Fatalf("recent --limit sin valor debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestRecentLimitNonIntegerFails(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "recent", "--limit", "abc")
	if code != 1 || !strings.Contains(errOut, "entero") {
		t.Fatalf("recent --limit abc debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestRecentUnknownArgFails(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "recent", "5")
	if code != 1 || !strings.Contains(errOut, "desconocido") {
		t.Fatalf("recent con argumento suelto debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestRecentEmptyStore(t *testing.T) {
	newStore(t)
	code, out, _ := run(t, "recent")
	if code != 0 || out != "" {
		t.Fatalf("recent con almacén vacío: code 0 y sin salida, obtuve code=%d out=%q", code, out)
	}
}

// ---- since -----------------------------------------------------------------

func sinceStore(t *testing.T) string {
	path := newStore(t)
	seed(t, path, []Note{
		{ID: 1, Title: "abril", CreatedAt: "2026-04-30T10:00:00Z"},
		{ID: 2, Title: "mayo-uno-tarde", CreatedAt: "2026-05-01T23:00:00Z"},
		{ID: 3, Title: "mayo-dos", CreatedAt: "2026-05-02T09:00:00Z"},
	})
	return path
}

func TestSinceInclusiveBoundary(t *testing.T) {
	sinceStore(t)
	code, out, _ := run(t, "since", "2026-05-01")
	if code != 0 {
		t.Fatalf("since code esperado 0, obtuve %d", code)
	}
	got := lines(out)
	// Debe incluir la nota del 2026-05-01 (aunque sea a las 23:00) y la del 05-02,
	// y excluir la del 2026-04-30. Orden descendente: id 3 luego id 2.
	if len(got) != 2 {
		t.Fatalf("esperaba 2 notas (>= 2026-05-01), obtuve %d: %q", len(got), out)
	}
	if !strings.HasPrefix(got[0], "3\t2026-05-02") {
		t.Fatalf("primera línea esperada id 3, obtuve %q", got[0])
	}
	if !strings.HasPrefix(got[1], "2\t2026-05-01T23:00:00Z") {
		t.Fatalf("segunda línea esperada la nota inclusiva id 2, obtuve %q", got[1])
	}
	if strings.Contains(out, "2026-04-30") {
		t.Fatalf("la nota del 2026-04-30 no debe aparecer: %q", out)
	}
}

func TestSinceNoMatches(t *testing.T) {
	sinceStore(t)
	code, out, _ := run(t, "since", "2026-06-01")
	if code != 0 || out != "" {
		t.Fatalf("sin coincidencias: code 0 y sin salida, obtuve code=%d out=%q", code, out)
	}
}

func TestSinceEmptyStore(t *testing.T) {
	newStore(t)
	code, out, _ := run(t, "since", "2026-05-01")
	if code != 0 || out != "" {
		t.Fatalf("almacén vacío: code 0 y sin salida, obtuve code=%d out=%q", code, out)
	}
}

func TestSinceInvalidFormat(t *testing.T) {
	sinceStore(t)
	code, _, errOut := run(t, "since", "2026/05/01")
	if code != 1 || !strings.Contains(errOut, "inválida") {
		t.Fatalf("fecha con formato inválido debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestSinceImpossibleDate(t *testing.T) {
	sinceStore(t)
	code, _, errOut := run(t, "since", "2026-13-40")
	if code != 1 || !strings.Contains(errOut, "inválida") {
		t.Fatalf("fecha imposible debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestSinceRequiresDate(t *testing.T) {
	newStore(t)
	code, _, errOut := run(t, "since")
	if code != 1 || !strings.Contains(errOut, "fecha") {
		t.Fatalf("since sin fecha debe fallar, code=%d err=%q", code, errOut)
	}
}

func TestSinceDescendingOrder(t *testing.T) {
	path := newStore(t)
	seed(t, path, []Note{
		note(1, "2026-05-01", "a"),
		note(2, "2026-05-03", "c"),
		note(3, "2026-05-02", "b"),
	})
	_, out, _ := run(t, "since", "2026-05-01")
	got := lines(out)
	if len(got) != 3 {
		t.Fatalf("esperaba 3 notas, obtuve %d: %q", len(got), out)
	}
	if !strings.HasPrefix(got[0], "2\t2026-05-03") || !strings.HasPrefix(got[2], "1\t2026-05-01") {
		t.Fatalf("orden descendente incorrecto: %q", out)
	}
}

// ---- caminos de error de E/S ----------------------------------------------

// Un almacén con JSON corrupto hace fallar Load: cada comando de lectura debe
// terminar en código 1. Ejercita las ramas `if err != nil { return 1 }` que de
// otro modo nunca se ejecutan (y sus mutantes de código de salida sobreviven).
func TestCommandsFailOnCorruptStore(t *testing.T) {
	path := newStore(t)
	if err := os.WriteFile(path, []byte("{{ esto no es json"), 0o644); err != nil {
		t.Fatalf("no pude sembrar basura: %v", err)
	}
	cases := [][]string{
		{"list"},
		{"count"},
		{"recent"},
		{"since", "2026-05-01"},
		{"add", "hola"},
	}
	for _, args := range cases {
		code, _, _ := run(t, args...)
		if code != 1 {
			t.Fatalf("%v sobre almacén corrupto debe devolver 1, obtuve %d", args, code)
		}
	}
}

// Si el directorio del almacén no existe, Load lo trata como vacío pero Save
// falla al crear el temporal: add debe devolver 1. Ejercita la rama de error de
// Save dentro de add.
func TestAddFailsWhenSaveCannotWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "no-existe", "notas.json")
	t.Setenv("NOTES_FILE", path)
	code, _, _ := run(t, "add", "hola")
	if code != 1 {
		t.Fatalf("add debe devolver 1 si Save no puede escribir, obtuve %d", code)
	}
}
