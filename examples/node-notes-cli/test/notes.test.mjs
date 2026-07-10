import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNote, NoteError, NoteNotFound } from '../src/notes.mjs';

test('createNote asigna id 1 cuando no hay notas', () => {
  const note = createNote('t', 'b', []);
  assert.equal(note.id, 1);
});

test('createNote asigna max(id)+1 con notas existentes', () => {
  const note = createNote('t', 'b', [{ id: 3 }, { id: 7 }, { id: 2 }]);
  assert.equal(note.id, 8);
});

test('createNote conserva title y body', () => {
  const note = createNote('titulo', 'cuerpo', []);
  assert.equal(note.title, 'titulo');
  assert.equal(note.body, 'cuerpo');
});

test('createNote usa el createdAt indicado', () => {
  const note = createNote('t', 'b', [], '2026-01-01T00:00:00.000Z');
  assert.equal(note.createdAt, '2026-01-01T00:00:00.000Z');
});

test('createNote genera createdAt ISO por defecto', () => {
  const note = createNote('t', 'b', []);
  assert.match(note.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('la nota es inmutable (frozen)', () => {
  const note = createNote('t', 'b', []);
  assert.ok(Object.isFrozen(note));
});

test('NoteNotFound es un NoteError', () => {
  assert.ok(new NoteNotFound('x') instanceof NoteError);
});
