import test from 'node:test';
import assert from 'node:assert/strict';
import { bereichFuer, summeTage, summeZwischen } from '../../client/src/kennzahlen.js';

const reihe = (von, n) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.parse(`${von}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
  total: 1, admob: 1,
}));

test('Zeitraum „Tag" vergleicht mit dem Schnitt der sieben Tage davor', () => {
  const b = bereichFuer(reihe('2026-10-01', 29), 'tag');
  assert.deepEqual(b, { von: '2026-10-29', bis: '2026-10-29', davor: ['2026-10-22', '2026-10-28'], teiler: 7 });
});

test('Ohne vollständigen Vergleichszeitraum gibt es keinen Vergleich', () => {
  assert.equal(bereichFuer(reihe('2026-10-01', 29), 'd30').davor, null);
  assert.deepEqual(bereichFuer(reihe('2026-08-01', 90), 'd30').davor, ['2026-08-31', '2026-09-29']);
  assert.deepEqual(bereichFuer(reihe('2026-10-01', 29), 'd7'), { von: '2026-10-23', bis: '2026-10-29', davor: ['2026-10-16', '2026-10-22'], teiler: 1 });
});

test('Monat vergleicht mit demselben Abschnitt des Vormonats, auch am 31.', () => {
  const b = bereichFuer(reihe('2026-01-01', 90), 'monat'); // endet 31.03.
  assert.deepEqual(b, { von: '2026-03-01', bis: '2026-03-31', davor: ['2026-02-01', '2026-02-28'], teiler: 1 });
});

test('Summen über Tageswerte und Reihe', () => {
  assert.equal(summeTage({ '2026-10-01': 0.1, '2026-10-02': 0.2, '2026-10-05': 9 }, '2026-10-01', '2026-10-02'), 0.3);
  assert.equal(summeZwischen(reihe('2026-10-01', 10), '2026-10-03', '2026-10-05', 'admob'), 3);
  assert.equal(bereichFuer([], 'tag'), null);
});
