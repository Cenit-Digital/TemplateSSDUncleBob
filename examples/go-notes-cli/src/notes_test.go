package src

import (
	"testing"
	"time"
)

func TestNextIDEmptyStartsAtOne(t *testing.T) {
	if got := NextID(nil); got != 1 {
		t.Fatalf("almacén vacío debe arrancar en 1, obtuve %d", got)
	}
}

func TestNextIDIsLastPlusOne(t *testing.T) {
	if got := NextID([]Note{{ID: 5}}); got != 6 {
		t.Fatalf("con última nota id=5 esperaba 6, obtuve %d", got)
	}
}

func TestNextIDSequential(t *testing.T) {
	if got := NextID([]Note{{ID: 1}, {ID: 2}, {ID: 3}}); got != 4 {
		t.Fatalf("con ids 1,2,3 esperaba 4, obtuve %d", got)
	}
}

func TestNewBuildsNote(t *testing.T) {
	now := time.Date(2026, 5, 1, 23, 0, 0, 0, time.UTC)
	note := New("título", "cuerpo", []Note{{ID: 7}}, now)
	if note.ID != 8 {
		t.Fatalf("id esperado 8, obtuve %d", note.ID)
	}
	if note.Title != "título" || note.Body != "cuerpo" {
		t.Fatalf("título/cuerpo incorrectos: %+v", note)
	}
	if note.CreatedAt != "2026-05-01T23:00:00Z" {
		t.Fatalf("created_at debe ser ISO 8601 UTC, obtuve %q", note.CreatedAt)
	}
}

func TestNewNormalizesToUTC(t *testing.T) {
	// Un instante con offset debe guardarse en UTC (formato Z).
	loc := time.FixedZone("CEST", 2*60*60)
	now := time.Date(2026, 5, 1, 12, 0, 0, 0, loc)
	note := New("t", "", nil, now)
	if note.CreatedAt != "2026-05-01T10:00:00Z" {
		t.Fatalf("esperaba conversión a UTC (10:00:00Z), obtuve %q", note.CreatedAt)
	}
}
