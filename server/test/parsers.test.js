import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseDelimited, toObjects, parseNumber } from '../csv.js';
import { unzip } from '../zip.js';
import { parseEarningsCsv, parseDate, fetchData as playFetch } from '../sources/playEarnings.js';
import { sumSales, sumFinance, makeJwt, salesByApp, reportUrl, appleFehler, zusammenfassen } from '../sources/appstore.js';
import { parseReport } from '../sources/admob.js';
import { parse as parseAdsense } from '../sources/adsense.js';
import { chartToDaily, projects, mergeProjects, fetchData } from '../sources/revenuecat.js';

const fx = (f) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f), 'utf8');

test('CSV mit Anführungszeichen und Kommas', () => {
  const rows = parseDelimited('a,b\n"x, y","sagt ""hi"""\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'sagt "hi"']]);
  assert.deepEqual(toObjects(rows), [{ a: 'x, y', b: 'sagt "hi"' }]);
});

test('Zahlen in verschiedenen Formaten', () => {
  assert.equal(parseNumber('1,234.56'), 1234.56);
  assert.equal(parseNumber('1.234,56'), 1234.56);
  assert.equal(parseNumber('-12,3'), -12.3);
  assert.equal(parseNumber('€1,234.50'), 1234.5);
  assert.equal(parseNumber('4.99'), 4.99);
  assert.ok(Number.isNaN(parseNumber('')));
});

test('Play-Earnings: Tagessummen und Monatsauszahlung', () => {
  const r = parseEarningsCsv(fx('play_earnings.csv'));
  assert.equal(r.currency, 'EUR');
  assert.equal(r.total, 7.69);
  assert.deepEqual(r.daily, [
    { date: '2026-07-01', amount: 3.44, currency: 'EUR' },
    { date: '2026-07-02', amount: 4.25, currency: 'EUR' },
  ]);
  assert.equal(parseDate('Sep 3, 2026'), '2026-09-03');
  assert.equal(parseDate('2026-09-03'), '2026-09-03');
  assert.equal(parseDate('Quatsch'), null);
});

test('Play: fehlender Bucket ist kein Fehler, sondern "noch nichts da"', async () => {
  process.env.PLAY_GCS_BUCKET = 'pubsite_prod_rev_0000000000000000000';
  const holeToken = async () => 'test-token';
  const vierNullVier = async () => {
    throw new Error('GET https://storage.googleapis.com/storage/v1/b/pubsite_prod_rev_0/o -> 404: {"error":{"code":404}}');
  };
  const r = await playFetch({ holeToken, fetchJSON: vierNullVier });
  assert.deepEqual(r.daily, []);
  assert.deepEqual(r.payouts, []);
  // Der Hinweis nennt beide möglichen Ursachen und den geprüften Bucket-Namen.
  assert.match(r.note, /gibt es nicht/);
  assert.match(r.note, /pubsite_prod_rev_0000000000000000000/);
  assert.match(r.note, /PLAY_GCS_BUCKET/);

  // Ein leerer, aber vorhandener Bucket ist dagegen eindeutig: nur noch kein Bericht.
  const leer = await playFetch({ holeToken, fetchJSON: async () => ({ items: [] }) });
  assert.match(leer.note, /Noch kein Earnings-Bericht im Bucket/);

  // Alles andere bleibt ein echter Fehler - eine fehlende Berechtigung darf nicht durchrutschen.
  await assert.rejects(() => playFetch({ holeToken, fetchJSON: async () => { throw new Error('GET … -> 403: kein Zugriff'); } }), /403/);
});

test('ZIP entpacken (Store und Deflate)', () => {
  // ZIP von Hand bauen: eine Datei, Deflate
  const name = Buffer.from('earnings.csv');
  const content = Buffer.from(fx('play_earnings.csv'));
  const comp = zlib.deflateRawSync(content);
  const crc = 0; // wird vom Leser nicht geprüft
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, comp, central, name, eocd]);
  const files = unzip(zip);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'earnings.csv');
  assert.equal(files[0].data.toString(), content.toString());
});

test('Apple Sales: Units × Proceeds je Währung', () => {
  assert.deepEqual(sumSales(fx('apple_sales.tsv')), { USD: 8.97, EUR: 7 });
});

test('Apple Finance: Extended Partner Share je Währung inkl. Retouren', () => {
  assert.deepEqual(sumFinance(fx('apple_finance.tsv')), { USD: 29.9, EUR: 10.5 });
});

test('Apple JWT ist ES256 mit passenden Claims', async () => {
  const { generateKeyPairSync, verify } = await import('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const jwt = makeJwt({ kid: 'KEY1', iss: 'ISS1', key: pem, now: 1000 });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY1', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert.equal(payload.exp - payload.iat, 900);
  assert.ok(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('AdMob-Bericht: Micros -> Betrag, Datum normalisiert', () => {
  const r = parseReport([
    { header: { localizationSettings: { currencyCode: 'USD' } } },
    { row: { dimensionValues: { DATE: { value: '20260901' } }, metricValues: { ESTIMATED_EARNINGS: { microsValue: '6500000' } } } },
    { footer: { matchingRowCount: 1 } },
  ]);
  assert.equal(r.currency, 'USD');
  assert.deepEqual(r.daily, [{ date: '2026-09-01', amount: 6.5, currency: 'USD' }]);
});

test('AdMob-Bericht: Aufschlüsselung nach Apps', () => {
  const r = parseReport([
    { header: { localizationSettings: { currencyCode: 'USD' } } },
    { row: { dimensionValues: { DATE: { value: '20260901' }, APP: { value: 'ca-app-pub-1~11', displayLabel: 'Swaply' } }, metricValues: { ESTIMATED_EARNINGS: { microsValue: '4000000' } } } },
    { row: { dimensionValues: { DATE: { value: '20260901' }, APP: { value: 'ca-app-pub-1~22', displayLabel: 'Mahjong Royale' } }, metricValues: { ESTIMATED_EARNINGS: { microsValue: '2500000' } } } },
    { footer: { matchingRowCount: 2 } },
  ]);
  // Tagessumme entsteht aus den App-Zeilen
  assert.deepEqual(r.daily, [{ date: '2026-09-01', amount: 6.5, currency: 'USD' }]);
  assert.deepEqual(r.apps, [
    { id: 'ca-app-pub-1~11', name: 'Swaply', date: '2026-09-01', amount: 4, currency: 'USD' },
    { id: 'ca-app-pub-1~22', name: 'Mahjong Royale', date: '2026-09-01', amount: 2.5, currency: 'USD' },
  ]);
});

test('Apple-Sales: Erlöse je App', () => {
  const apps = salesByApp(fx('apple_sales.tsv'));
  assert.ok(apps.length >= 1);
  const usd = apps.find((a) => a.currency === 'USD');
  assert.equal(usd.name, 'App');
  assert.equal(usd.id, '123');
  assert.equal(usd.amount, 8.97); // 3 x 2.99
});

test('Play-Earnings: Aufschlüsselung nach App', () => {
  const r = parseEarningsCsv(fx('play_earnings.csv'));
  assert.ok(r.apps.length >= 1);
  const a = r.apps.find((x) => x.id === 'com.example.app');
  assert.equal(a.name, 'Pro Abo');
  assert.equal(a.currency, 'EUR');
  assert.ok(a.amount > 0);
});

test('Apple-Berichtsadresse: der Pfad gehört nicht in die Abfrage', () => {
  const url = reportUrl('salesReports', { 'filter[reportType]': 'SALES', 'filter[vendorNumber]': '94467826' });
  assert.equal(url.split('?')[0], 'https://api.appstoreconnect.apple.com/v1/salesReports');
  // Genau die übergebenen Filter, kein zusätzlicher Parameter – Apple antwortet sonst mit 400.
  assert.deepEqual([...new URL(url).searchParams.keys()].sort(), ['filter[reportType]', 'filter[vendorNumber]']);
});

test('Apple-Fehler: die Begründung statt der Fehler-ID', () => {
  const e = Object.assign(new Error('GET https://api.appstoreconnect.apple.com/v1/salesReports -> 400: {"errors"…'), {
    status: 400,
    body: JSON.stringify({ errors: [{ id: '8ee', status: '400', code: 'PARAMETER_ERROR.INVALID', title: 'A parameter has an invalid value', detail: "The parameter '_path' is not permitted" }] }),
  });
  assert.equal(appleFehler(e), "PARAMETER_ERROR.INVALID: The parameter '_path' is not permitted");
  // Ohne verwertbaren Rumpf bleibt die rohe Meldung übrig.
  assert.match(appleFehler(new Error('Netz weg')), /Netz weg/);
});

test('Gleiche Fehler werden gezählt statt wiederholt', () => {
  assert.equal(zusammenfassen(['A', 'A', 'A', 'B']), '3× A | B');
  assert.equal(zusammenfassen(['A']), 'A');
});

test('AdSense: Tageswerte und offenes Guthaben', () => {
  const r = parseAdsense(
    { headers: [{ name: 'DATE' }, { name: 'ESTIMATED_EARNINGS', currencyCode: 'EUR' }], rows: [{ cells: [{ value: '2026-09-01' }, { value: '1.25' }] }] },
    { payments: [{ name: 'accounts/pub-1/payments/unpaid', amount: '€12.34' }, { name: 'accounts/pub-1/payments/2026-08-21', amount: '€100.00' }] }
  );
  assert.deepEqual(r.daily, [{ date: '2026-09-01', amount: 1.25, currency: 'EUR' }]);
  assert.deepEqual(r.balance, { amount: 12.34, currency: 'EUR', label: 'Offenes AdSense-Guthaben' });
});

test('RevenueCat-Chart defensiv lesen', () => {
  assert.deepEqual(chartToDaily({ values: [{ date: '2026-09-01', value: 3 }, { date: 'kaputt', value: 1 }] }, 'EUR'), [{ date: '2026-09-01', amount: 3, currency: 'EUR' }]);
  assert.deepEqual(chartToDaily({ series: [{ values: [{ x: 1788220800, y: 2.5 }] }] }, 'EUR'), [{ date: '2026-09-01', amount: 2.5, currency: 'EUR' }]);
  assert.deepEqual(chartToDaily({}, 'EUR'), []);
});

test('RevenueCat: nummerierte Projekt-Paare lesen', () => {
  assert.deepEqual(projects({ REVENUECAT_API_KEY: 'k1', REVENUECAT_PROJECT_ID: 'p1' }),
    [{ key: 'k1', id: 'p1', label: 'Projekt 1' }]);
  assert.deepEqual(projects({
    REVENUECAT_API_KEY: 'k1', REVENUECAT_PROJECT_ID: 'p1', REVENUECAT_LABEL: 'App A',
    REVENUECAT_API_KEY_2: 'k2', REVENUECAT_PROJECT_ID_2: 'p2',
    REVENUECAT_API_KEY_3: 'k3', // Projekt-ID fehlt -> wird übersprungen
  }), [
    { key: 'k1', id: 'p1', label: 'App A' },
    { key: 'k2', id: 'p2', label: 'Projekt 2' },
  ]);
  assert.deepEqual(projects({}), []);
});

test('RevenueCat: zwei Projekte zusammenrechnen', () => {
  const r = mergeProjects([
    { label: 'App A', currency: 'EUR', daily: [{ date: '2026-09-01', amount: 10, currency: 'EUR' }], revenue28: 100, mrr: 40, activeSubscriptions: 12, activeTrials: 2, note: null },
    { label: 'App B', currency: 'EUR', daily: [{ date: '2026-09-01', amount: 5, currency: 'EUR' }], revenue28: 50, mrr: 20, activeSubscriptions: 6, activeTrials: null, note: null },
  ]);
  assert.equal(r.currency, 'EUR');
  assert.equal(r.daily.length, 2); // collect.mergeSource summiert die gleichen Tage
  assert.deepEqual(r.balances, [{ amount: 150, currency: 'EUR', label: 'Umsatz letzte 28 Tage' }]);
  assert.equal(r.extra.mrr, 60);
  assert.equal(r.extra.activeSubscriptions, 18);
  assert.equal(r.extra.activeTrials, 2);
  assert.deepEqual(r.extra.projects.map((p) => p.label), ['App A', 'App B']);
  assert.match(r.note, /2 Projekte/);
});

test('RevenueCat: verschiedene Währungen bleiben getrennt', () => {
  const r = mergeProjects([
    { label: 'A', currency: 'EUR', daily: [], revenue28: 100, mrr: 10, activeSubscriptions: 1, activeTrials: 0, note: null },
    { label: 'B', currency: 'USD', daily: [], revenue28: 60, mrr: 5, activeSubscriptions: 2, activeTrials: 0, note: null },
  ]);
  assert.equal(r.currency, null);
  assert.deepEqual(r.balances.sort((a, b) => a.currency.localeCompare(b.currency)), [
    { amount: 100, currency: 'EUR', label: 'Umsatz letzte 28 Tage' },
    { amount: 60, currency: 'USD', label: 'Umsatz letzte 28 Tage' },
  ]);
});

test('RevenueCat: ein kaputtes Projekt blockiert das andere nicht', async () => {
  const env = { REVENUECAT_API_KEY: 'k1', REVENUECAT_PROJECT_ID: 'gut', REVENUECAT_API_KEY_2: 'k2', REVENUECAT_PROJECT_ID_2: 'kaputt' };
  const alt = {};
  for (const [k, v] of Object.entries(env)) { alt[k] = process.env[k]; process.env[k] = v; }
  const fetchJSON = async (url) => {
    if (url.includes('kaputt')) throw new Error('401 Unauthorized');
    if (url.includes('/charts/')) throw new Error('403 kein Chart-Recht');
    return { currency: 'EUR', metrics: [{ id: 'mrr', value: 33 }, { id: 'revenue', value: 99 }] };
  };
  const r = await fetchData({ fetchJSON });
  assert.equal(r.extra.mrr, 33);
  assert.equal(r.extra.projects.length, 1);
  assert.match(r.note, /Nicht abrufbar: Projekt 2/);
  assert.match(r.note, /Tagesverlauf nicht verfügbar/);
  // Das erfolgreiche Projekt steht einzeln in der Liste, damit die Übersicht zeigen kann,
  // welche App überhaupt zählt.
  assert.deepEqual(r.extra.projects.map((p) => p.label), ['Projekt 1']);
  for (const [k, v] of Object.entries(alt)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
