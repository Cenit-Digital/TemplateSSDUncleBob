package src

import "time"

// Note es el modelo de dominio: una nota con id incremental, título, cuerpo y
// fecha de creación en ISO 8601. Las etiquetas JSON fijan el contrato del
// archivo de almacenamiento (snake_case), igual que los ejemplos Python/Node.
type Note struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

// NextID devuelve el siguiente id incremental. Las notas se guardan en orden de
// creación (append), así que la última tiene el id mayor: el siguiente es ese
// más uno. Un almacén vacío arranca en 1.
func NextID(existing []Note) int {
	if len(existing) == 0 {
		return 1
	}
	return existing[len(existing)-1].ID + 1
}

// New construye una nota nueva a partir del título, el cuerpo, las notas
// existentes (para calcular el id) y el instante de creación.
func New(title, body string, existing []Note, now time.Time) Note {
	return Note{
		ID:        NextID(existing),
		Title:     title,
		Body:      body,
		CreatedAt: now.UTC().Format(time.RFC3339),
	}
}
