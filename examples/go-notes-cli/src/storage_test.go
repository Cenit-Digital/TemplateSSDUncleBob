package src

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMissingFileReturnsEmpty(t *testing.T) {
	notes, err := Load(filepath.Join(t.TempDir(), "no-existe.json"))
	if err != nil {
		t.Fatalf("Load de archivo inexistente no debe fallar: %v", err)
	}
	if len(notes) != 0 {
		t.Fatalf("esperaba lista vacía, obtuve %d notas", len(notes))
	}
}

func TestSaveThenLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notas.json")
	want := []Note{
		{ID: 1, Title: "uno", Body: "cuerpo uno", CreatedAt: "2026-05-01T10:00:00Z"},
		{ID: 2, Title: "dos", Body: "cuerpo dos", CreatedAt: "2026-05-02T10:00:00Z"},
	}
	if err := Save(want, path); err != nil {
		t.Fatalf("Save falló: %v", err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load falló: %v", err)
	}
	if len(got) != len(want) {
		t.Fatalf("esperaba %d notas, obtuve %d", len(want), len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("nota %d: esperaba %+v, obtuve %+v", i, want[i], got[i])
		}
	}
}

func TestSaveIsAtomicAndOverwrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "notas.json")
	if err := Save([]Note{{ID: 1, Title: "vieja", CreatedAt: "2026-05-01T10:00:00Z"}}, path); err != nil {
		t.Fatalf("primer Save falló: %v", err)
	}
	if err := Save([]Note{{ID: 9, Title: "nueva", CreatedAt: "2026-05-09T10:00:00Z"}}, path); err != nil {
		t.Fatalf("segundo Save falló: %v", err)
	}
	got, err := Load(path)
	if err != nil {
		t.Fatalf("Load falló: %v", err)
	}
	if len(got) != 1 || got[0].ID != 9 || got[0].Title != "nueva" {
		t.Fatalf("el segundo Save debe reemplazar por completo, obtuve %+v", got)
	}
	// No debe quedar ningún temporal .notes-*.json en el directorio.
	entries, _ := os.ReadDir(filepath.Dir(path))
	for _, e := range entries {
		if e.Name() != "notas.json" {
			t.Fatalf("quedó un archivo inesperado tras Save: %q", e.Name())
		}
	}
}

// TestSaveReturnsErrorWhenTargetIsDirectory ejercita el fallo del rename final:
// si el destino es un directorio existente, os.Rename falla y Save debe
// propagar el error (no tragárselo). Sin este caso, invertir la comprobación
// de error del rename sería un mutante que sobrevive.
func TestSaveReturnsErrorWhenTargetIsDirectory(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "soy-un-directorio")
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatalf("no pude crear el directorio de prueba: %v", err)
	}
	if err := Save([]Note{{ID: 1, CreatedAt: "2026-05-01T10:00:00Z"}}, target); err == nil {
		t.Fatalf("Save sobre un directorio existente debe devolver error")
	}
	// El temporal creado no debe quedar huérfano tras el fallo.
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "soy-un-directorio" {
		t.Fatalf("el temporal debe limpiarse tras un rename fallido, quedó: %v", entries)
	}
}
