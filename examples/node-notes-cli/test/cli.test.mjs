import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as storage from '../src/storage.mjs';
import { main } from '../src/cli.mjs';

let dir;
let notesPath;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nnc-cli-'));
  notesPath = join(dir, 'notes.json');
  storage.setDefaultPath(notesPath);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function run(argv) {
  const out = [];
  const err = [];
  const code = main(argv, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join(''), err: err.join('') };
}

test('add imprime id=1 y guarda la nota', () => {
  const { code, out } = run(['add', 'primera', '--body', 'hola']);
  assert.equal(code, 0);
  assert.equal(out, 'id=1\n');
  const notes = storage.load(notesPath);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'primera');
  assert.equal(notes[0].body, 'hola');
});

test('add sin --body deja el cuerpo vacío', () => {
  run(['add', 'solo-titulo']);
  const notes = storage.load(notesPath);
  assert.equal(notes[0].body, '');
});

test('add con --body guarda exactamente ese cuerpo', () => {
  run(['add', 'titulo', '--body', 'cuerpo-exacto']);
  const notes = storage.load(notesPath);
  assert.equal(notes[0].body, 'cuerpo-exacto');
});

test('add requiere un título', () => {
  const { code, err } = run(['add']);
  assert.equal(code, 1);
  assert.notEqual(err, '');
});

test('list vacío no imprime nada', () => {
  const { code, out } = run(['list']);
  assert.equal(code, 0);
  assert.equal(out, '');
});

test('list imprime una línea por nota con formato id\\tfecha\\ttitulo', () => {
  run(['add', 'uno', '--body', 'a']);
  run(['add', 'dos', '--body', 'b']);
  const { code, out } = run(['list']);
  assert.equal(code, 0);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^1\t.+\tuno$/);
  assert.match(lines[1], /^2\t.+\tdos$/);
});

test('show imprime título, fecha y cuerpo', () => {
  run(['add', 'titulo-uno', '--body', 'cuerpo-uno']);
  const { code, out } = run(['show', '1']);
  assert.equal(code, 0);
  const lines = out.trimEnd().split('\n');
  assert.equal(lines[0], 'titulo-uno');
  assert.match(lines[1], /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(lines[2], 'cuerpo-uno');
});

test('show con id inexistente sale con código 1 y mensaje en err', () => {
  const { code, out, err } = run(['show', '99']);
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.ok(err.includes('99'));
});

test('show con id no numérico es error de código 1', () => {
  const { code, err } = run(['show', 'abc']);
  assert.equal(code, 1);
  assert.ok(err.includes('inválido'));
});

test('show sin id es error', () => {
  const { code, err } = run(['show']);
  assert.equal(code, 1);
  assert.notEqual(err, '');
});

test('delete elimina la nota y confirma', () => {
  run(['add', 'uno', '--body', 'a']);
  run(['add', 'dos', '--body', 'b']);
  const { code, out } = run(['delete', '1']);
  assert.equal(code, 0);
  assert.equal(out, 'borrada id=1\n');
  const notes = storage.load(notesPath);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, 2);
});

test('delete con id inexistente sale con código 1', () => {
  run(['add', 'uno', '--body', 'a']);
  const { code, out, err } = run(['delete', '42']);
  assert.equal(code, 1);
  assert.equal(out, '');
  assert.ok(err.includes('42'));
  assert.equal(storage.load(notesPath).length, 1);
});

test('count imprime 0 con almacén vacío', () => {
  const { code, out, err } = run(['count']);
  assert.equal(code, 0);
  assert.equal(out, '0\n');
  assert.equal(err, '');
});

test('count imprime el total exacto', () => {
  run(['add', 'uno', '--body', 'a']);
  run(['add', 'dos', '--body', 'b']);
  run(['add', 'tres', '--body', 'c']);
  const { code, out } = run(['count']);
  assert.equal(code, 0);
  assert.equal(out, '3\n');
});

test('count no crea el almacén cuando no existe', () => {
  const { code, out } = run(['count']);
  assert.equal(code, 0);
  assert.equal(out, '0\n');
  assert.ok(!existsSync(notesPath));
});

test('comando desconocido sale con código 2 y mensaje en err', () => {
  const { code, out, err } = run(['frobnicate']);
  assert.equal(code, 2);
  assert.equal(out, '');
  assert.ok(err.includes('frobnicate'));
});

test('sin comando sale con código 2', () => {
  const { code, err } = run([]);
  assert.equal(code, 2);
  assert.notEqual(err, '');
});
