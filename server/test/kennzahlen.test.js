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

// ---- Zwischenstände des laufenden Tages -----------------------------------

import { merkeZwischenstand, pruneHistory, emptyHistory } from '../collect.js';
import { buildSummary } from '../summary.js';

const verlauf = () => {
  const h = emptyHistory();
  h.daily.admob = { '2026-11-17': { EUR: 1, USD: 2 } };
  h.apps.admob = { a1: { name: 'Wetter', platform: 'ios', daily: { '2026-11-17': { EUR: 1 } } } };
  h.sources.admob = { status: 'ok' };
  return h;
};

test('Zwischenstand: nur bei Änderung, höchstens einer je Viertelstunde', () => {
  const h = verlauf(), tag = '2026-11-17';
  merkeZwischenstand(h, tag, new Date('2026-11-17T10:01:00Z'));
  merkeZwischenstand(h, tag, new Date('2026-11-17T10:20:00Z'));
  assert.equal(h.intraday[tag].length, 1, 'unverändert → kein neuer Punkt');
  h.daily.admob[tag].EUR = 2;
  merkeZwischenstand(h, tag, new Date('2026-11-17T10:05:00Z'));
  assert.equal(h.intraday[tag].length, 1, 'gleiche Viertelstunde → ersetzt');
  assert.equal(h.intraday[tag][0].q.admob.EUR, 2);
  h.daily.admob[tag].EUR = 3;
  merkeZwischenstand(h, tag, new Date('2026-11-17T11:00:00Z'));
  assert.equal(h.intraday[tag].length, 2);
  // Der Punkt ist eine Kopie: spätere Änderungen am Verlauf dürfen ihn nicht mitziehen.
  h.daily.admob[tag].EUR = 9;
  assert.equal(h.intraday[tag][1].q.admob.EUR, 3);
});

test('Zwischenstand: ohne Meldung für den Tag kein Punkt, Aufräumen nach zwei Tagen', () => {
  const h = verlauf();
  merkeZwischenstand(h, '2026-11-18', new Date('2026-11-18T00:10:00Z'));
  assert.deepEqual(h.intraday, {});
  h.intraday = { '2026-11-15': [{}], '2026-11-16': [{}], '2026-11-17': [{}] };
  pruneHistory(h, new Date('2026-11-17T12:00:00Z'));
  assert.deepEqual(Object.keys(h.intraday), ['2026-11-16', '2026-11-17']);
});

test('Zusammenfassung rechnet Zwischenstände um und ordnet sie den App-Zeilen zu', () => {
  const h = verlauf(), tag = '2026-11-17';
  merkeZwischenstand(h, tag, new Date('2026-11-17T10:00:00Z'));
  const s = buildSummary(h, { base: 'EUR', rates: { USD: 2 } }, null, new Date('2026-11-17T12:00:00Z'));
  assert.deepEqual(s.intraday.heute, [{ t: '2026-11-17T10:00:00.000Z', apps: { 'wetter:ios': { admob: 1 } }, admob: 2, total: 2 }]);
  assert.equal(s.intraday.heute.at(-1).total, s.kpis.today);
  assert.deepEqual(s.intraday.gestern, []);
  assert.equal(s.apps[0].key, 'wetter:ios');
});

import { tagesKurve } from '../../client/src/kennzahlen.js';

test('Tageskurve: Stand gilt bis zum nächsten Abruf, heute endet bei jetzt', () => {
  const heute = [{ t: '2026-11-17T08:00:00Z', total: 2 }, { t: '2026-11-17T10:00:00Z', total: 5 }];
  const gestern = [{ t: '2026-11-16T09:00:00Z', total: 4 }];
  const k = tagesKurve(heute, gestern, '2026-11-17', Date.parse('2026-11-17T12:00:00Z'));
  const um = (zeit) => k.find((r) => r.x === Date.parse(zeit));
  assert.deepEqual(k.map((r) => new Date(r.x).toISOString().slice(11, 16)), ['00:00', '08:00', '09:00', '10:00', '12:00', '00:00']);
  assert.equal(um('2026-11-17T00:00:00Z').wert, 0);
  assert.equal(um('2026-11-17T09:00:00Z').wert, 2);
  assert.equal(um('2026-11-17T09:00:00Z').gestern, 4);
  assert.equal(um('2026-11-17T12:00:00Z').wert, 5);
  assert.equal(k.at(-1).wert, null);
  assert.equal(k.at(-1).gestern, 4);
  assert.deepEqual(tagesKurve([], [], '2026-11-17').map((r) => r.wert), [null, null]);
});
