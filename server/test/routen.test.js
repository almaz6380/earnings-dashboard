import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SESSION_SECRET = 'test-secret-mindestens-16-zeichen';
process.env.TOKEN_ENC_KEY = 'test-enc-key-mindestens-16-zeichen';

const { ROUTEN, finde, normalisiere, sicher } = await import('../routen.js');
const { pfadKandidaten } = await import('../../api/index.js');

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('jede Route zeigt auf eine Funktion', () => {
  for (const [pfad, handler] of Object.entries(ROUTEN)) {
    assert.equal(typeof handler, 'function', `${pfad} hat keinen Handler`);
    assert.match(pfad, /^\/api\//, `${pfad} beginnt nicht mit /api/`);
  }
});

test('normalisiere räumt Abfrage, doppelte und abschliessende Schrägstriche weg', () => {
  assert.equal(normalisiere('/api/state?x=1'), '/api/state');
  assert.equal(normalisiere('/api/state/'), '/api/state');
  assert.equal(normalisiere('/api//google//start'), '/api/google/start');
  assert.equal(normalisiere('/'), '/');
});

test('finde trifft bekannte und verwirft unbekannte Adressen', () => {
  assert.equal(finde('/api/state'), ROUTEN['/api/state']);
  assert.equal(finde('/api/google/callback?code=abc'), ROUTEN['/api/google/callback']);
  assert.equal(finde('/api/gibtsnicht'), null);
});

test('Kandidaten decken beide Wege der Vercel-Umleitung ab', () => {
  // Direkt: der ursprüngliche Pfad steht in req.url.
  assert.ok(pfadKandidaten({ url: '/api/google/start?ticket=x' }).some((p) => finde(p)));
  // Umgeleitet: req.url zeigt auf die Funktion, der Pfad steckt in ?pfad=.
  assert.ok(pfadKandidaten({ url: '/api/index?pfad=google/start', query: { pfad: 'google/start' } }).some((p) => finde(p)));
  // Als Segmentliste, falls Vercel den Platzhalter so durchreicht.
  assert.ok(pfadKandidaten({ url: '/api/index', query: { pfad: ['revenuecat', 'callback'] } }).some((p) => finde(p)));
  // Nicht ersetzter Platzhalter darf nicht als Pfad durchgehen.
  assert.deepEqual(pfadKandidaten({ url: '/api/index', query: { pfad: ':pfad*' } }), ['/api/index']);
});

test('Hobby-Tarif: höchstens 12 Funktionen im Ordner api/', () => {
  const zaehle = (ordner) => fs.readdirSync(ordner, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? zaehle(path.join(ordner, e.name)) : e.name.endsWith('.js') ? 1 : 0), 0);
  assert.ok(zaehle(path.join(wurzel, 'api')) <= 12, 'Vercel Hobby erlaubt nur 12 Funktionen pro Deployment');
});

test('vercel.json leitet alle /api-Adressen auf die eine Funktion', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(wurzel, 'vercel.json'), 'utf8'));
  assert.deepEqual(cfg.rewrites, [{ source: '/api/:pfad*', destination: '/api/index?pfad=:pfad*' }]);
  assert.ok(cfg.functions['api/index.js'], 'maxDuration muss an api/index.js hängen');
  assert.ok(finde(cfg.crons[0].path), 'der Cron-Pfad muss eine bekannte Route sein');
});

function fakeRes() {
  const r = { code: 0, body: null, headersSent: false, writableEnded: false, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; r.headersSent = true; return r; };
  return r;
}

test('sicher: ein Speicherfehler wird zu einer lesbaren 500 statt zum Absturz', async () => {
  const fehler = console.error;
  console.error = () => {};
  try {
    const res = fakeRes();
    await sicher(async () => { throw new Error('Redis GET: 401 Unauthorized'); }, '/api/login')({}, res);
    assert.equal(res.code, 500);
    assert.match(res.body.fehler, /Speicher/);
    // Die Rohmeldung darf nicht nach draussen: sie kann Teile der Antwort des Anbieters enthalten.
    assert.doesNotMatch(res.body.fehler, /Redis|401|Unauthorized/);
  } finally { console.error = fehler; }
});

test('sicher: nach begonnener Antwort wird nichts mehr angehaengt', async () => {
  const fehler = console.error;
  console.error = () => {};
  try {
    const res = fakeRes();
    await sicher(async (_req, r) => { r.status(200).json({ ok: true }); throw new Error('zu spaet'); }, '/api/test')({}, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body, { ok: true });
  } finally { console.error = fehler; }
});

test('sicher: eine normale Antwort geht unveraendert durch', async () => {
  const res = fakeRes();
  await sicher(async (_req, r) => r.status(204).json(null), '/api/x')({}, res);
  assert.equal(res.code, 204);
});

test('/api/health nennt fehlende Schluessel und gibt nie einen Wert preis', async () => {
  const alt = { s: process.env.SESSION_SECRET, t: process.env.TOKEN_ENC_KEY };
  const fehler = console.error;
  console.error = () => {};
  try {
    const { default: health } = await import('../handlers/health.js');

    // Alles gesetzt: bereit, nichts fehlt.
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.TOKEN_ENC_KEY = 'b'.repeat(32);
    let res = fakeRes();
    await health({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.bereit, true);
    assert.deepEqual(res.body.fehlt, []);

    // Fehlt einer: 503 und der Name steht drin - der Wert nirgends.
    delete process.env.SESSION_SECRET;
    process.env.TOKEN_ENC_KEY = 'geheimer-wert-1234567890';
    res = fakeRes();
    await health({ method: 'GET', headers: {} }, res);
    assert.equal(res.code, 503);
    assert.deepEqual(res.body.fehlt, ['SESSION_SECRET']);
    assert.ok(!JSON.stringify(res.body).includes('geheimer-wert'));

    // Zu kurz zaehlt wie fehlend - genau wie in auth.js und crypto.js.
    process.env.SESSION_SECRET = 'kurz';
    res = fakeRes();
    await health({ method: 'GET', headers: {} }, res);
    assert.deepEqual(res.body.fehlt, ['SESSION_SECRET']);
  } finally {
    console.error = fehler;
    process.env.SESSION_SECRET = alt.s; process.env.TOKEN_ENC_KEY = alt.t;
  }
});

test('/api/health meldet Namen als ja/nein und nie einen Wert', async () => {
  const alt = { s: process.env.SESSION_SECRET, g: process.env.GOOGLE_CLIENT_ID };
  try {
    const { default: health } = await import('../handlers/health.js');
    process.env.SESSION_SECRET = 'a'.repeat(32);
    process.env.GOOGLE_CLIENT_ID = 'streng-geheimer-client-1234';
    const res = fakeRes();
    await health({ method: 'GET', headers: {} }, res);
    assert.equal(res.body.gesetzt.SESSION_SECRET, true);
    assert.equal(res.body.gesetzt.GOOGLE_CLIENT_ID, true);
    assert.equal(res.body.gesetzt.TELEGRAM_BOT_TOKEN, false);
    assert.equal(res.body.laeuft.umgebung, 'lokal');
    assert.ok(!JSON.stringify(res.body).includes('streng-geheimer'));
  } finally {
    process.env.SESSION_SECRET = alt.s;
    if (alt.g === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = alt.g;
  }
});
