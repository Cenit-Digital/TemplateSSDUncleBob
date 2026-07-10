import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as storage from '../src/storage.mjs';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nnc-store-'));
  path = join(dir, 'notes.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('load devuelve [] cuando el archivo no existe', () => {
  assert.deepEqual(storage.load(path), []);
});

test('save y load hacen roundtrip', () => {
  const notes = [{ id: 1, title: 'hola', body: 'mundo', createdAt: '2026-01-01T00:00:00.000Z' }];
  storage.save(notes, path);
  assert.deepEqual(storage.load(path), notes);
});

test('save es atómico: no deja archivos temporales', () => {
  storage.save([{ id: 1, title: 'x', body: 'y', createdAt: 'z' }], path);
  assert.ok(existsSync(path));
  const leftovers = readdirSync(dir).filter((f) => f.startsWith('.notes_'));
  assert.deepEqual(leftovers, []);
});

test('save serializa JSON legible: UTF-8 sin escapar y 2 espacios', () => {
  storage.save([{ id: 1, title: 'café', body: 'ñandú', createdAt: 'z' }], path);
  const text = readFileSync(path, 'utf8');
  assert.ok(text.includes('café'));
  assert.ok(text.includes('ñandú'));
  assert.ok(!text.includes('\\u'));
  const lines = text.split('\n');
  assert.equal(lines[1], '  {'); // sangría de exactamente 2 espacios
});

test('getDefaultPath refleja setDefaultPath', () => {
  const previous = storage.getDefaultPath();
  storage.setDefaultPath('/tmp/otra-ruta.json');
  assert.equal(storage.getDefaultPath(), '/tmp/otra-ruta.json');
  storage.setDefaultPath(previous);
});
