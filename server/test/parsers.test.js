import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseDelimited, toObjects, parseNumber } from '../csv.js';
import { unzip } from '../zip.js';
import { parseEarningsCsv, parseDate } from '../sources/playEarnings.js';
import { sumSales, sumFinance, makeJwt } from '../sources/appstore.js';
import { parseReport } from '../sources/admob.js';
import { parse as parseAdsense } from '../sources/adsense.js';
import { chartToDaily } from '../sources/revenuecat.js';

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
