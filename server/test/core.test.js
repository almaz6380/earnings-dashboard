import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret-mindestens-16-zeichen';
process.env.TOKEN_ENC_KEY = 'test-enc-key-mindestens-16-zeichen';
process.env.BASE_CURRENCY = 'EUR';

const { makeToken, verifyToken, parseCookies, cookieHeader, COOKIE } = await import('../auth.js');
const { encrypt, decrypt } = await import('../crypto.js');
const { toBase } = await import('../fx.js');
const { mergeSource, mergeApps, pruneHistory, emptyHistory } = await import('../collect.js');
const { buildSummary } = await import('../summary.js');
const { formatDaily } = await import('../notify.js');
const { makeState, verifyState, makeTicket, verifyTicket } = await import('../google/oauth.js');
const { hashPassword, checkPassword, passwordProblem, maskConfig, normEmail, emailOk } = await import('../users.js');

const USER = { id: 'abc123', pwv: 1 };

const FX = { base: 'EUR', date: '2026-09-02', rates: { EUR: 1, USD: 1.25, CHF: 0.95 } };

test('Sitzungs-Token: gültig, abgelaufen, manipuliert, trägt Konto und Passwort-Version', () => {
  const t = makeToken(USER, 1_000_000);
  assert.deepEqual(verifyToken(t, 1_000_000 + 1000), { id: 'abc123', pwv: 1 });
  assert.equal(verifyToken(t, 1_000_000 + 31 * 86400000), null);
  assert.equal(verifyToken(t.slice(0, -2) + 'xx', 1_000_000), null);
  assert.equal(verifyToken(t.replace('abc123.1.', 'abc123.2.'), 1_000_000), null); // andere pwv, gleiche Signatur
  assert.equal(verifyToken('', 0), null);
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

test('Google-State signiert, zeitlich begrenzt, trägt Konto und Herkunft', () => {
  const s = makeState('abc123', { native: true });
  assert.equal(verifyState(s).u, 'abc123');
  assert.equal(verifyState(s).native, true);
  assert.equal(verifyState(makeState('abc123')).native, false);
  assert.equal(verifyState(s + 'x'), null);
  assert.equal(verifyState(''), null);
  // Ticket für die App: nur als Ticket gültig, nicht als State und umgekehrt
  const t = makeTicket('abc123');
  assert.equal(verifyTicket(t).u, 'abc123');
  assert.equal(verifyTicket(s), null);
});

test('Passwörter: scrypt-Hash, Prüfung, Mindestlänge', () => {
  const h = hashPassword('sehr-geheim-123');
  assert.notEqual(h, 'sehr-geheim-123');
  assert.notEqual(hashPassword('sehr-geheim-123'), h); // eigenes Salt je Hash
  assert.ok(checkPassword('sehr-geheim-123', h));
  assert.ok(!checkPassword('sehr-geheim-124', h));
  assert.ok(!checkPassword('sehr-geheim-123', 'kaputt'));
  assert.ok(!checkPassword(undefined, h));
  assert.match(passwordProblem('kurz'), /mindestens 10/);
  assert.equal(passwordProblem('lang-genug-passwort'), null);
  assert.equal(normEmail('  Max@Example.COM '), 'max@example.com');
  assert.ok(emailOk('max@example.com'));
  assert.ok(!emailOk('max@example'));
  assert.ok(!emailOk('kein-at'));
});

test('Konfiguration maskiert: Geheimnisse nur mit Endung, Rest im Klartext', () => {
  const fields = new Map([['WISE_API_TOKEN', { secret: true }], ['WISE_PROFILE_ID', {}]]);
  const m = maskConfig({ WISE_API_TOKEN: 'abcdefghijkl', WISE_PROFILE_ID: '4711', UNBEKANNT: 'x' }, fields);
  assert.deepEqual(m.WISE_API_TOKEN, { set: true, hint: '…ijkl' });
  assert.deepEqual(m.WISE_PROFILE_ID, { set: true, value: '4711' });
  assert.equal(m.UNBEKANNT.value, undefined); // unbekannte Felder gelten als geheim
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
  // Ein Icon aus einer der Quellen genügt für die zusammengeführte App.
  h.apps.admob['ca~11'].icon = 'https://icon.example/swaply.png';
  const swaply = buildSummary(h, FX, null, new Date('2026-09-02T12:00:00Z')).apps.find((a) => a.key === 'swaply');
  assert.equal(swaply.icon, 'https://icon.example/swaply.png');
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

  // Store-Kennung wird gemerkt, damit das Icon gefunden werden kann.
  mergeApps(h, 'admob', { apps: [{ id: 'ca~11', name: 'Swaply', date: '2026-09-03', amount: 1, currency: 'EUR', platform: 'android', storeId: 'com.swaply' }] }, '2026-09-04');
  assert.equal(h.apps.admob['ca~11'].platform, 'android');
  assert.equal(h.apps.admob['ca~11'].storeId, 'com.swaply');
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

// ---- Native App: Bearer-Token und CORS -------------------------------------
const { isAuthed } = await import('../auth.js');
const { allowedOrigin, applyCors } = await import('../cors.js');

test('Bearer-Token zählt wie das Cookie', () => {
  const t = makeToken(USER);
  assert.ok(isAuthed({ headers: { authorization: `Bearer ${t}` } }));
  assert.ok(isAuthed({ headers: { cookie: `${COOKIE}=${t}` } }));
  assert.ok(!isAuthed({ headers: { authorization: 'Bearer kaputt.kaputt' } }));
  assert.ok(!isAuthed({ headers: { authorization: `Token ${t}` } }));
  assert.ok(!isAuthed({ headers: {} }));
});

function fakeRes() {
  const r = { headers: {}, code: null, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.end = () => { r.ended = true; };
  return r;
}

test('CORS: nur App-Origins, Preflight wird beantwortet', () => {
  assert.ok(allowedOrigin('capacitor://localhost'));
  assert.ok(allowedOrigin('https://localhost'));
  assert.ok(!allowedOrigin('https://boese.example'));
  assert.ok(!allowedOrigin(undefined));
  process.env.APP_ORIGINS = 'https://zweite.example/';
  assert.ok(allowedOrigin('https://zweite.example'));
  delete process.env.APP_ORIGINS;

  let res = fakeRes();
  assert.equal(applyCors({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }, res), true);
  assert.equal(res.code, 204);
  assert.ok(res.ended);
  assert.equal(res.headers['access-control-allow-origin'], 'capacitor://localhost');
  assert.match(res.headers['access-control-allow-headers'], /authorization/);

  res = fakeRes();
  assert.equal(applyCors({ method: 'GET', headers: { origin: 'https://boese.example' } }, res), false);
  assert.equal(res.headers['access-control-allow-origin'], undefined);

  res = fakeRes();
  assert.equal(applyCors({ method: 'GET', headers: {} }, res), false);
  assert.equal(res.code, null);
});
