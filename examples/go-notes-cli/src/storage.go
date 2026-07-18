// Package src es el ejemplo de referencia del arnés SSD "Uncle Bob" para Go.
//
// El nombre del paquete es `src` a propósito: espeja el layout de los ejemplos
// Python (`from src import ...`) y Node (`src/`). En un proyecto Go real usarías
// nombres de paquete de dominio (`notes`, `storage`); aquí prima el paralelismo
// didáctico entre stacks.
package src

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// Load lee las notas del archivo JSON en path. Si el archivo no existe devuelve
// una lista vacía (no es un error: "aún no hay notas" es un estado válido).
func Load(path string) ([]Note, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var notes []Note
	if err := json.Unmarshal(data, &notes); err != nil {
		return nil, err
	}
	return notes, nil
}

// Save escribe las notas en path de forma atómica: serializa a un archivo
// temporal en el mismo directorio y lo renombra sobre el destino. Así el
// archivo nunca queda a medias si el proceso muere a mitad de escritura.
func Save(notes []Note, path string) error {
	data, err := json.MarshalIndent(notes, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".notes-*.json")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}
