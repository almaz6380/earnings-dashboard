// Google-Login je Konto für AdMob, AdSense und Play-Finanzberichte (Cloud Storage).
//
// Ein Konto kann mehrere Google-Verbindungen haben: AdMob läuft oft über ein
// privates Konto und die Play Console über ein Firmenkonto. Jede Verbindung hat
// eine eigene ID, jeder Quellen-Eintrag verweist auf eine davon.
//
// Der OAuth-Client (GOOGLE_CLIENT_ID/SECRET) gehört dem Betreiber, die
// Refresh-Tokens gehören den Nutzern und liegen AES-verschlüsselt unter
// u:<id>:google_tokens.
import crypto from 'node:crypto';
import { loadJSON, saveJSON, deleteJSON } from '../store.js';
import { encrypt, decrypt } from '../crypto.js';
import { getJSON } from '../http.js';
import { ukey } from '../users.js';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/admob.readonly',
  'https://www.googleapis.com/auth/adsense.readonly',
  'https://www.googleapis.com/auth/devstorage.read_only',
];

// Rücksprung in die native App nach dem Login (URL-Schema, in Info.plist und AndroidManifest eingetragen).
export const APP_SCHEME = 'einnahmen';

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// Basis-URL: PUBLIC_URL, sonst aus dem Request (Vercel setzt host + x-forwarded-proto), sonst lokal.
export function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const host = req?.headers?.host;
  if (host) return `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${host}`;
  return 'http://localhost:3001';
}

export function redirectUri(req) {
  return `${baseUrl(req)}/api/google/callback`;
}

// ---- Signierte Umschläge (State und Einmal-Ticket) -------------------------

function stateSecret() {
  return process.env.SESSION_SECRET || 'dev';
}

const sig = (s) => crypto.createHmac('sha256', stateSecret()).update(s).digest('base64url');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { return null; } };

export function makeEnvelope(payload, ttlMs) {
  const body = b64({ ...payload, t: Date.now(), n: crypto.randomBytes(8).toString('base64url'), ttl: ttlMs });
  return `${body}.${sig(body)}`;
}

export function verifyEnvelope(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const body = token.slice(0, i), s = token.slice(i + 1);
  const want = sig(body);
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  const p = unb64(body);
  if (!p?.u || !p.t || Date.now() - p.t > (p.ttl || 0)) return null;
  return p;
}

export const makeState = (userId, { native = false } = {}) => makeEnvelope({ u: userId, native: !!native }, 10 * 60 * 1000);
export const verifyState = (state) => verifyEnvelope(state);

// Einmal-Ticket: die App öffnet damit /api/google/start im System-Browser, ohne dort angemeldet zu sein.
export const makeTicket = (userId) => makeEnvelope({ u: userId, ticket: true }, 5 * 60 * 1000);
export const verifyTicket = (t) => { const p = verifyEnvelope(t); return p?.ticket ? p : null; };

export function authUrl(state, req) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(params) {
  return getJSON('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      ...params,
    }),
  });
}

// ---- Verbindungen ----------------------------------------------------------

const tokKey = (userId) => ukey(userId, 'google_tokens');

// Frühere Fassungen kannten genau eine Verbindung. Beim Lesen übersetzen.
export function normalisiere(gespeichert) {
  if (!gespeichert) return { v: 2, verbindungen: [] };
  if (gespeichert.v === 2 && Array.isArray(gespeichert.verbindungen)) return gespeichert;
  if (gespeichert.refresh) {
    return { v: 2, verbindungen: [{ id: 'g1', ...gespeichert }] };
  }
  return { v: 2, verbindungen: [] };
}

async function lade(userId) {
  return normalisiere(await loadJSON(tokKey(userId)));
}

// Ohne Refresh-Token - das verlässt den Server nie.
const oeffentlich = (v) => ({ id: v.id, email: v.email || null, connectedAt: v.connectedAt || null, scopes: (v.scope || '').split(' ').filter(Boolean), lastError: v.lastError || null });

export async function verbindungen(userId) {
  return (await lade(userId)).verbindungen.map(oeffentlich);
}

export async function googleStatus(userId) {
  const liste = await verbindungen(userId);
  return { configured: googleConfigured(), connected: liste.length > 0, verbindungen: liste };
}

export async function exchangeCode(code, req, userId) {
  const tok = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(req) });
  if (!tok.refresh_token) throw new Error('Google hat keinen Refresh-Token geliefert. Zugriff unter myaccount.google.com/permissions entfernen und erneut verbinden.');
  let email = null;
  try {
    const info = await getJSON('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
    email = info.email || null;
  } catch { /* nur Anzeige */ }

  const daten = await lade(userId);
  // Dasselbe Google-Konto zweimal zu verbinden hilft niemandem - dann wird der
  // vorhandene Eintrag aufgefrischt und die Zuordnung der Quellen bleibt gültig.
  const vorhanden = email ? daten.verbindungen.find((v) => v.email === email) : null;
  const eintrag = {
    id: vorhanden?.id || `g${crypto.randomBytes(4).toString('hex')}`,
    email,
    refresh: encrypt(tok.refresh_token),
    scope: tok.scope || SCOPES.join(' '),
    connectedAt: new Date().toISOString(),
    lastError: null,
  };
  daten.verbindungen = vorhanden
    ? daten.verbindungen.map((v) => (v.id === vorhanden.id ? eintrag : v))
    : [...daten.verbindungen, eintrag];
  await saveJSON(tokKey(userId), daten);
  cache.delete(`${userId}|${eintrag.id}`);
  return { email, id: eintrag.id, neu: !vorhanden };
}

export async function disconnect(userId, verbindungId) {
  const daten = await lade(userId);
  daten.verbindungen = verbindungId ? daten.verbindungen.filter((v) => v.id !== verbindungId) : [];
  for (const k of [...cache.keys()]) if (k.startsWith(`${userId}|`)) cache.delete(k);
  if (daten.verbindungen.length) await saveJSON(tokKey(userId), daten);
  else await deleteJSON(tokKey(userId));
}

async function merkeFehler(userId, verbindungId, msg) {
  const daten = await lade(userId);
  daten.verbindungen = daten.verbindungen.map((v) => (v.id === verbindungId ? { ...v, lastError: msg } : v));
  await saveJSON(tokKey(userId), daten);
}

// Access-Token-Cache je Konto und Verbindung (lebt nur solange die Serverless-Instanz).
const cache = new Map();

export async function getAccessToken(userId, verbindungId) {
  const daten = await lade(userId);
  // Ohne ausdrückliche Zuordnung die erste Verbindung - so laufen Einträge weiter,
  // die vor der Mehrfachverbindung angelegt wurden.
  const v = (verbindungId && daten.verbindungen.find((x) => x.id === verbindungId)) || daten.verbindungen[0];
  if (!v) throw new Error('Google nicht verbunden. Unter „Einrichten" ein Google-Konto verbinden.');
  const schluessel = `${userId}|${v.id}`;
  const c = cache.get(schluessel);
  if (c && c.exp > Date.now() + 60000) return c.token;
  try {
    const tok = await tokenRequest({ refresh_token: decrypt(v.refresh), grant_type: 'refresh_token' });
    cache.set(schluessel, { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
    if (v.lastError) await merkeFehler(userId, v.id, null);
    return tok.access_token;
  } catch (e) {
    const msg = /invalid_grant/.test(e.message)
      ? `Google-Zugriff abgelaufen oder widerrufen${v.email ? ` (${v.email})` : ''}. Bitte unter „Einrichten" erneut verbinden.`
      : e.message;
    await merkeFehler(userId, v.id, msg);
    throw new Error(msg);
  }
}

// Zugriff für die Quellen-Einträge eines Kontos: { fetch, token }.
export function googleFor(userId, verbindungId) {
  const token = () => getAccessToken(userId, verbindungId);
  const fetch = async (url, init = {}) => {
    const tk = await token();
    return getJSON(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${tk}` } });
  };
  return { fetch, token };
}
