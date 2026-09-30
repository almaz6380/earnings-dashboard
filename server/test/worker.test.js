// Cloudflare-Einstieg (worker/index.js) und das günstigere Passwortformat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { alsReq, neuesRes, alsResponse } from '../../worker/index.js';
import { hashPassword, checkPassword, hashZuTeuer } from '../users.js';

test('neue Passwörter tragen das günstige Format und lassen sich prüfen', () => {
  const h = hashPassword('ein-langes-passwort');
  assert.match(h, /^scrypt-n2048\./);
  assert.equal(checkPassword('ein-langes-passwort', h), true);
  assert.equal(checkPassword('falsch-falsch-falsch', h), false);
});

test('alte N=16384-Hashes bleiben außerhalb des Workers gültig', () => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync('altes-passwort-123', salt, 64, { N: 16384, r: 8, p: 1 });
  const alt = `scrypt.${salt.toString('base64')}.${hash.toString('base64')}`;
  const vorher = process.env.NUR_GUENSTIGE_HASHES;
  try {
    delete process.env.NUR_GUENSTIGE_HASHES;
    assert.equal(hashZuTeuer(alt), false);
    assert.equal(checkPassword('altes-passwort-123', alt), true);
    // Im Worker: gar nicht erst rechnen, sonst reißt das CPU-Limit den Aufruf ab.
    process.env.NUR_GUENSTIGE_HASHES = '1';
    assert.equal(hashZuTeuer(alt), true);
    assert.equal(checkPassword('altes-passwort-123', alt), false);
    assert.equal(hashZuTeuer(hashPassword('neues-passwort-12')), false);
  } finally {
    if (vorher === undefined) delete process.env.NUR_GUENSTIGE_HASHES; else process.env.NUR_GUENSTIGE_HASHES = vorher;
  }
});

test('unbekanntes Format wird abgelehnt, nicht durchgerechnet', () => {
  assert.equal(checkPassword('x', 'md5.abc.def'), false);
  assert.equal(checkPassword('x', 'constructor.abc.def'), false);
});

test('alsReq: Pfad, Abfrage, Kopfzeilen und JSON-Body wie bei Vercel', async () => {
  const req = await alsReq(new Request('https://einnahmen.example.workers.dev/api/login?a=1&a=2&b=x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', Origin: 'capacitor://localhost' },
    body: JSON.stringify({ email: 'a@b.cd' }),
  }));
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/api/login?a=1&a=2&b=x');
  assert.deepEqual(req.query, { a: ['1', '2'], b: 'x' });
  assert.deepEqual(req.body, { email: 'a@b.cd' });
  assert.equal(req.headers.origin, 'capacitor://localhost');
  // Ohne diese beiden gingen OAuth-Rücksprünge an http:// und die Anmeldebremse sähe keine IP.
  assert.equal(req.headers['x-forwarded-proto'], 'https');
  assert.equal(req.headers['x-forwarded-for'], '203.0.113.9');
});

test('neuesRes: mehrere Cookies, JSON, Weiterleitung, 204 ohne Inhalt', async () => {
  const res = neuesRes();
  res.setHeader('set-cookie', 'a=1');
  res.setHeader('set-cookie', 'b=2');
  res.status(201).json({ ok: true });
  assert.equal(res.headersSent, true);
  const r = alsResponse(res);
  assert.equal(r.status, 201);
  assert.deepEqual(r.headers.getSetCookie(), ['a=1', 'b=2']);
  assert.deepEqual(await r.json(), { ok: true });

  const w = neuesRes();
  w.redirect(302, 'https://accounts.google.com/o/oauth2/v2/auth?x=1');
  const rw = alsResponse(w);
  assert.equal(rw.status, 302);
  assert.equal(rw.headers.get('location'), 'https://accounts.google.com/o/oauth2/v2/auth?x=1');

  const leer = neuesRes();
  leer.status(204).end();
  assert.equal(alsResponse(leer).status, 204);
});
