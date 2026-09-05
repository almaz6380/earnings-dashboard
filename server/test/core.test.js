import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret-mindestens-16-zeichen';
process.env.TOKEN_ENC_KEY = 'test-enc-key-mindestens-16-zeichen';
process.env.DASHBOARD_PASSWORD = 'geheim123';
process.env.BASE_CURRENCY = 'EUR';

const { makeToken, verifyToken, parseCookies, cookieHeader, COOKIE } = await import('../auth.js');
const { encrypt, decrypt } = await import('../crypto.js');
const { toBase } = await import('../fx.js');
const { mergeSource, mergeApps, pruneHistory, emptyHistory } = await import('../collect.js');
const { buildSummary } = await import('../summary.js');
const { formatDaily } = await import('../notify.js');
const { makeState, verifyState } = await import('../google/oauth.js');

const FX = { base: 'EUR', date: '2026-09-02', rates: { EUR: 1, USD: 1.25, CHF: 0.95 } };

test('Sitzungs-Token: gültig, abgelaufen, manipuliert', () => {
  const t = makeToken(1_000_000);
  assert.ok(verifyToken(t, 1_000_000 + 1000));
  assert.ok(!verifyToken(t, 1_000_000 + 31 * 86400000));
  assert.ok(!verifyToken(t.slice(0, -2) + 'xx', 1_000_000));
  assert.ok(!verifyToken('', 0));
  assert.equal(parseCookies(`a=1; ${COOKIE}=${t}`)[COOKIE], t);
  assert.match(cookieHeader('abc', { maxAgeSec: 10, secure: true }), /HttpOnly; SameSite=Lax; Max-Age=10; Secure/);
});

test('Verschlüsselung hin und zurück, Manipulation fliegt auf', () => {
  const enc = encrypt('refresh-token-123');
  assert.notEqual(enc, 'refresh-token-123');
  assert.equal(decrypt(enc), 'refresh-token-123');
  const [iv, tag, data] = enc.split('.');
  assert.throws(() => decrypt([iv, tag, Buffer.from('xxxx').toString('base64')].join('.')));
});

test('Google-State signiert und zeitlich begrenzt', () => {
  const s = makeState();
  assert.ok(verifyState(s));
  assert.ok(!verifyState(s + 'x'));
  assert.ok(!verifyState(''));
});

test('Wechselkurs: Basis, Fremdwährung, unbekannt', () => {
  assert.equal(toBase(10, 'EUR', FX), 10);
  assert.equal(toBase(12.5, 'usd', FX), 10);
  assert.equal(toBase(5, 'JPY', FX), null);
  assert.equal(toBase(null, 'EUR', FX), null);
});

function sampleHistory() {
  const h = emptyHistory();
  const today = '2026-09-02';
  mergeSource(h, 'admob', { daily: [{ date: '2026-09-01', amount: 12.5, currency: 'USD' }, { date: '2026-08-15', amount: 25, currency: 'USD' }] }, today);
  mergeSource(h, 'appstore', { daily: [{ date: '2026-09-01', amount: 4, currency: 'EUR' }, { date: '2026-09-01', amount: 2.5, currency: 'USD' }],
    payouts: [{ month: '2026-07', amount: 100, currency: 'USD' }] }, today);
  mergeSource(h, 'play', { daily: [{ date: '2026-09-01', amount: 1, currency: 'EUR' }, { date: '2026-09-01', amount: 2, currency: 'EUR' }] }, today);
  mergeSource(h, 'wise', { balances: [{ amount: 200, currency: 'EUR' }, { amount: 125, currency: 'USD' }] }, today);
  mergeSource(h, 'adsense', { balance: { amount: 30, currency: 'EUR', label: 'Offen' } }, today);
  h.sources.admob = { status: 'ok' }; h.sources.appstore = { status: 'ok' }; h.sources.play = { status: 'ok' }; h.sources.wise = { status: 'ok' };
  h.sources.adsense = { status: 'error', lastError: 'kaputt' };
  return h;
}

test('Verlauf mischen: gleiche Währung am Tag summiert, mehrere Währungen getrennt', () => {
  const h = sampleHistory();
  assert.deepEqual(h.daily.play['2026-09-01'], { EUR: 3 });
  assert.deepEqual(h.daily.appstore['2026-09-01'], { EUR: 4, USD: 2.5 });
  assert.deepEqual(h.payouts.appstore, { '2026-07': { USD: 100 } });
  assert.equal(h.balances['2026-09-02'].wise.length, 2);
  // erneuter Abruf ersetzt den Tageswert statt zu verdoppeln
  mergeSource(h, 'play', { daily: [{ date: '2026-09-01', amount: 5, currency: 'EUR' }] }, '2026-09-03');
  assert.deepEqual(h.daily.play['2026-09-01'], { EUR: 5 });
});

test('Zusammenfassung: Summen in EUR, Abo-Umsatz aus Stores, Konten und Auszahlungen', () => {
  const s = buildSummary(sampleHistory(), FX, { collectedAt: '2026-09-02T06:00:00Z' }, new Date('2026-09-02T12:00:00Z'));
  assert.equal(s.subsSource, 'stores');
  // gestern: admob 10 + appstore (4 + 2) + play 3 = 19
  assert.equal(s.kpis.yesterday, 19);
  assert.equal(s.kpis.month, 19);
  assert.equal(s.kpis.lastMonth, 20); // admob 25 USD im August
  assert.equal(s.bySource.admob.yesterday, 10);
  assert.equal(s.bySource.appstore.countsInTotal, true);
  assert.equal(s.accountsEur, 300);
  assert.equal(s.openEur, 30);
  assert.deepEqual(s.payouts[0], { source: 'appstore', label: 'App Store', month: '2026-07', amount: 100, currency: 'USD', eur: 80 });
  assert.equal(s.series.length, 90);
  assert.equal(s.series.at(-2).total, 19);
  assert.equal(s.monthly.at(-1).total, 19);
  assert.equal(s.bySource.adsense.status, 'error');
  assert.equal(s.bySource.revenuecat.status, 'unconfigured');
  const text = formatDaily(s);
  assert.match(text, /Gestern: 19,00 €/);
  assert.match(text, /Konten \(Wise\/PayPal\): 300,00 €/);
  assert.match(text, /AdSense: kaputt/);
});

test('RevenueCat-Tageswerte haben Vorrang vor Store-Erlösen', () => {
  const h = sampleHistory();
  mergeSource(h, 'revenuecat', { daily: [{ date: '2026-09-01', amount: 50, currency: 'EUR' }] }, '2026-09-02');
  const s = buildSummary(h, FX, null, new Date('2026-09-02T12:00:00Z'));
  assert.equal(s.subsSource, 'revenuecat');
  assert.equal(s.kpis.yesterday, 60); // admob 10 + rc 50
  assert.equal(s.bySource.appstore.countsInTotal, false);
});

test('App-Aufschlüsselung: gleiche App aus zwei Quellen wird eine Zeile', () => {
  const h = sampleHistory();
  mergeApps(h, 'admob', { apps: [
    { id: 'ca~11', name: 'Swaply', date: '2026-09-01', amount: 6, currency: 'USD' },
    { id: 'ca~22', name: 'Mahjong Royale', date: '2026-09-01', amount: 5, currency: 'EUR' },
  ] }, '2026-09-02');
  mergeApps(h, 'appstore', { apps: [{ id: '123', name: 'Swaply ', date: '2026-09-01', amount: 4, currency: 'EUR' }] }, '2026-09-02');
  const s = buildSummary(h, FX, null, new Date('2026-09-02T12:00:00Z'));
  const swaply = s.apps.find((a) => a.key === 'swaply');
  assert.equal(swaply.yesterday, 8.8); // 6 USD = 4,80 € + 4 €
  assert.deepEqual(swaply.sources.map((q) => q.id).sort(), ['admob', 'appstore']);
  // Je Quelle stehen dieselben Zeiträume bereit wie für die App, damit die
  // Anzeige zwischen 7 Tagen, 30 Tagen und Monat umschalten kann.
  const admob = swaply.sources.find((q) => q.id === 'admob');
  assert.equal(admob.yesterday, 4.8);
  assert.equal(admob.d7, 4.8);
  assert.equal(admob.d30, 4.8);
  assert.equal(swaply.sources.find((q) => q.id === 'appstore').yesterday, 4);
  // sortiert nach 30-Tage-Summe
  assert.deepEqual(s.apps.map((a) => a.name), ['Swaply', 'Mahjong Royale']);
  // Sobald RevenueCat Tageswerte liefert, zählen die Store-Erlöse nicht mehr mit -
  // dann darf die App-Aufschlüsselung sie auch nicht doppelt zeigen.
  mergeSource(h, 'revenuecat', { daily: [{ date: '2026-09-01', amount: 50, currency: 'EUR' }] }, '2026-09-02');
  const s2 = buildSummary(h, FX, null, new Date('2026-09-02T12:00:00Z'));
  const swaply2 = s2.apps.find((a) => a.key === 'swaply');
  assert.deepEqual(swaply2.sources.map((q) => q.id), ['admob']);
  assert.equal(swaply2.yesterday, 4.8);
});

test('App-Werte: neuer Abruf ersetzt den Tageswert', () => {
  const h = emptyHistory();
  mergeApps(h, 'admob', { apps: [{ id: 'ca~11', name: 'Swaply', date: '2026-09-01', amount: 6, currency: 'EUR' }] }, '2026-09-02');
  mergeApps(h, 'admob', { apps: [{ id: 'ca~11', name: 'Swaply', date: '2026-09-01', amount: 9, currency: 'EUR' }] }, '2026-09-03');
  assert.deepEqual(h.apps.admob['ca~11'].daily['2026-09-01'], { EUR: 9 });
  // zwei Zeilen im selben Lauf werden dagegen summiert
  mergeApps(h, 'admob', { apps: [
    { id: 'ca~11', name: 'Swaply', date: '2026-09-02', amount: 1, currency: 'EUR' },
    { id: 'ca~11', name: 'Swaply', date: '2026-09-02', amount: 2, currency: 'EUR' },
  ] }, '2026-09-03');
  assert.deepEqual(h.apps.admob['ca~11'].daily['2026-09-02'], { EUR: 3 });
});

test('Nicht umrechenbare Währungen: Betrag statt nur Kürzel', () => {
  const h = emptyHistory();
  // VND führt die EZB nicht - der Betrag darf nicht stillschweigend als 0 verschwinden.
  mergeSource(h, 'appstore', { daily: [
    { date: '2026-09-01', amount: 1250000, currency: 'VND' },
    { date: '2026-09-01', amount: 4, currency: 'EUR' },
  ] }, '2026-09-02');
  mergeSource(h, 'admob', { daily: [{ date: '2020-01-05', amount: 300000, currency: 'VND' }] }, '2026-09-02');
  const s = buildSummary(h, FX, null, new Date('2026-09-02T12:00:00Z'));
  const vnd = s.unconverted.find((u) => u.currency === 'VND');
  assert.equal(vnd.gesamt, 1550000);
  assert.equal(vnd.d30, 1250000); // der alte Tag von 2020 zählt nur in die Gesamtsumme
  // Die umrechenbare Hälfte zählt weiter ganz normal mit.
  assert.equal(s.bySource.appstore.yesterday, 4);

  // Eine Währung ohne Erlös (Gratis-Downloads) ist keine Lücke und wird nicht gemeldet.
  const h2 = emptyHistory();
  mergeSource(h2, 'appstore', { daily: [{ date: '2026-09-01', amount: 0, currency: 'VND' }] }, '2026-09-02');
  assert.deepEqual(buildSummary(h2, FX, null, new Date('2026-09-02T12:00:00Z')).unconverted, []);
});

test('Letzter gemeldeter Tag: gemeldete Null ist nicht dasselbe wie keine Meldung', () => {
  const h = emptyHistory();
  // AdMob meldet bis zum 01.09. und liefert für den 01. eine echte Null.
  mergeSource(h, 'admob', { daily: [
    { date: '2026-08-31', amount: 2, currency: 'EUR' },
    { date: '2026-09-01', amount: 0, currency: 'EUR' },
  ] }, '2026-09-03');
  // AdSense ist einen Tag weiter.
  mergeSource(h, 'adsense', { daily: [{ date: '2026-09-02', amount: 1.5, currency: 'EUR' }] }, '2026-09-03');
  const s = buildSummary(h, FX, null, new Date('2026-09-03T12:00:00Z'));

  // Der jüngste gemeldete Tag über alle zählenden Quellen, nicht der jüngste mit Umsatz.
  assert.equal(s.lastDayDate, '2026-09-02');
  assert.equal(s.kpis.lastDay, 1.5);
  // Je Quelle ihr eigener letzter Tag - AdMob mit einer echten Null.
  assert.equal(s.bySource.admob.lastDayDate, '2026-09-01');
  assert.equal(s.bySource.admob.lastDay, 0);
  // Eine Quelle ohne jede Meldung bleibt null statt 0 - das unterscheidet die Anzeige.
  assert.equal(s.bySource.play.lastDayDate, null);
  assert.equal(s.bySource.play.lastDay, null);
  // Am 02.09. hatte AdMob noch nichts gemeldet; die Kachel nennt das, statt Vollständigkeit vorzutäuschen.
  assert.deepEqual(s.lastDaySources, ['AdSense']);
  assert.deepEqual(s.lastDayFehlend, ['AdMob']);
});

test('Ohne jede Meldung bleibt der letzte Tag leer', () => {
  const s = buildSummary(emptyHistory(), FX, null, new Date('2026-09-03T12:00:00Z'));
  assert.equal(s.lastDayDate, null);
  assert.equal(s.kpis.lastDay, null);
});

test('Verlauf beschneiden', () => {
  const h = emptyHistory();
  h.daily.admob = { '2020-01-01': { USD: 1 }, '2026-09-01': { USD: 1 } };
  h.balances = { '2020-01-01': {}, '2026-09-01': {} };
  pruneHistory(h, new Date('2026-09-02'));
  assert.deepEqual(Object.keys(h.daily.admob), ['2026-09-01']);
  assert.deepEqual(Object.keys(h.balances), ['2026-09-01']);
});

test('Basis-URL: PUBLIC_URL, sonst aus dem Request', async () => {
  const { baseUrl, redirectUri } = await import('../google/oauth.js');
  delete process.env.PUBLIC_URL;
  assert.equal(baseUrl({ headers: { host: 'app.vercel.app', 'x-forwarded-proto': 'https' } }), 'https://app.vercel.app');
  assert.equal(baseUrl({ headers: { host: 'localhost:3001' } }), 'http://localhost:3001');
  assert.equal(baseUrl(), 'http://localhost:3001');
  process.env.PUBLIC_URL = 'https://fest.example/';
  assert.equal(redirectUri({ headers: { host: 'egal' } }), 'https://fest.example/api/google/callback');
  delete process.env.PUBLIC_URL;
});
