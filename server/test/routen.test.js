import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SESSION_SECRET = 'test-secret-mindestens-16-zeichen';
process.env.TOKEN_ENC_KEY = 'test-enc-key-mindestens-16-zeichen';

const { ROUTEN, finde, normalisiere } = await import('../routen.js');
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
