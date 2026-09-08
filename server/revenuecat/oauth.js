// RevenueCat-Login (OAuth 2.0, Authorization Code mit PKCE).
//
// Anders als bei den Secret Keys gilt ein Login für alle Projekte des Kontos -
// die Projekte lassen sich danach auflisten, statt IDs abzutippen.
//
// Der Client gehört dem Betreiber und muss bei RevenueCat registriert werden
// (support@revenuecat.com, mit Redirect-URI und den Scopes unten). Ohne
// REVENUECAT_CLIENT_ID/SECRET bleibt nur der Schlüssel-Weg - die App zeigt den
// Login dann gar nicht erst an.
//
// Achtung Laufzeit: Access-Token 1 Stunde, Refresh-Token 30 Tage. Der tägliche
// Sammellauf frischt beides auf; rotiert RevenueCat den Refresh-Token, wird der
// neue gespeichert. Wer die App einen Monat lang nicht nutzt, muss sich neu anmelden.
import crypto from 'node:crypto';
import { loadJSON, saveJSON, deleteJSON } from '../store.js';
import { encrypt, decrypt } from '../crypto.js';
import { getJSON } from '../http.js';
import { ukey } from '../users.js';
import { baseUrl, makeEnvelope, verifyEnvelope } from '../google/oauth.js';

const AUTH_URL = 'https://api.revenuecat.com/oauth2/authorize';
const TOKEN_URL = 'https://api.revenuecat.com/oauth2/token';

// Nur lesend, und nur was das Dashboard braucht.
export const SCOPES = ['charts_metrics:overview:read', 'charts_metrics:charts:read'];

export function konfiguriert() {
  return !!(process.env.REVENUECAT_CLIENT_ID && process.env.REVENUECAT_CLIENT_SECRET);
}

export function redirectUri(req) {
  return `${baseUrl(req)}/api/revenuecat/callback`;
}

const tokKey = (userId) => ukey(userId, 'revenuecat_tokens');
const pkceKey = (nonce) => `rcpkce:${nonce}`;

export const makeState = (userId, { native = false } = {}) => makeEnvelope({ u: userId, native: !!native, rc: true }, 10 * 60 * 1000);
export const verifyState = (s) => { const p = verifyEnvelope(s); return p?.rc ? p : null; };
export const makeTicket = (userId) => makeEnvelope({ u: userId, ticket: true, rc: true }, 5 * 60 * 1000);
export const verifyTicket = (t) => { const p = verifyEnvelope(t); return p?.ticket && p?.rc ? p : null; };

// PKCE: der Verifier bleibt auf dem Server. Ihn in den State zu legen wäre bequem,
// gäbe ihn aber dem Browser - und damit wäre der Schutz aufgehoben.
export async function authUrl(userId, req, { native = false } = {}) {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const nonce = crypto.randomBytes(12).toString('base64url');
  await saveJSON(pkceKey(nonce), { verifier, exp: Date.now() + 10 * 60 * 1000 });
  const state = `${nonce}~${makeState(userId, { native })}`;
  const q = new URLSearchParams({
    client_id: process.env.REVENUECAT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${q}`;
}

export function teileState(roh) {
  const s = String(roh || '');
  const i = s.indexOf('~');
  if (i < 0) return { nonce: null, state: null };
  return { nonce: s.slice(0, i), state: verifyState(s.slice(i + 1)) };
}

async function tokenRequest(params) {
  return getJSON(TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${process.env.REVENUECAT_CLIENT_ID}:${process.env.REVENUECAT_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams(params),
  });
}

async function speichere(userId, tok, vorher = {}) {
  const daten = {
    refresh: tok.refresh_token ? encrypt(tok.refresh_token) : vorher.refresh,
    scope: tok.scope || vorher.scope || SCOPES.join(' '),
    connectedAt: vorher.connectedAt || new Date().toISOString(),
    erneuertAm: new Date().toISOString(),
    lastError: null,
  };
  await saveJSON(tokKey(userId), daten);
  cache.set(userId, { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
  return daten;
}

export async function exchangeCode(code, nonce, req, userId) {
  const p = await loadJSON(pkceKey(nonce));
  if (!p?.verifier || p.exp < Date.now()) throw new Error('Der Anmeldevorgang ist abgelaufen. Bitte erneut versuchen.');
  await deleteJSON(pkceKey(nonce));
  const tok = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req),
    code_verifier: p.verifier,
    client_id: process.env.REVENUECAT_CLIENT_ID,
  });
  if (!tok.refresh_token) throw new Error('RevenueCat hat keinen Refresh-Token geliefert.');
  await speichere(userId, tok);
  return { ok: true };
}

export async function status(userId) {
  const t = await loadJSON(tokKey(userId));
  return {
    verfuegbar: konfiguriert(),
    verbunden: !!t,
    connectedAt: t?.connectedAt || null,
    lastError: t?.lastError || null,
  };
}

export async function trennen(userId) {
  cache.delete(userId);
  await deleteJSON(tokKey(userId));
}

const cache = new Map();

export async function getAccessToken(userId) {
  const c = cache.get(userId);
  if (c && c.exp > Date.now() + 60000) return c.token;
  const t = await loadJSON(tokKey(userId));
  if (!t) throw new Error('RevenueCat nicht verbunden. Unter „Einrichten" anmelden.');
  try {
    const tok = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: decrypt(t.refresh),
      client_id: process.env.REVENUECAT_CLIENT_ID,
    });
    // RevenueCat kann den Refresh-Token austauschen; dann muss der neue gespeichert
    // werden, sonst ist die Verbindung beim nächsten Lauf tot.
    await speichere(userId, tok, t);
    return tok.access_token;
  } catch (e) {
    const msg = /invalid_grant|invalid_request/.test(e.message)
      ? 'RevenueCat-Zugriff abgelaufen oder widerrufen. Bitte unter „Einrichten" erneut anmelden. (Refresh-Tokens laufen nach 30 Tagen ohne Nutzung ab.)'
      : e.message;
    await saveJSON(tokKey(userId), { ...t, lastError: msg });
    throw new Error(msg);
  }
}

// Zugriff für die Quellen-Einträge: { token }.
export function revenuecatFor(userId) {
  return { token: () => getAccessToken(userId) };
}
