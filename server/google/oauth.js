// Ein Google-Login je Konto für AdMob, AdSense und Play-Finanzberichte (Cloud Storage).
// Der OAuth-Client (GOOGLE_CLIENT_ID/SECRET) gehört dem Betreiber, der Refresh-Token
// jedem Nutzer: AES-verschlüsselt unter u:<id>:google_tokens.
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

// Rücksprung in die native App nach dem Google-Login (URL-Schema, in Info.plist und AndroidManifest eingetragen).
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

function stateSecret() {
  return process.env.SESSION_SECRET || 'dev';
}

const sig = (s) => crypto.createHmac('sha256', stateSecret()).update(s).digest('base64url');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unb64 = (s) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); } catch { return null; } };

// Signierter, zeitlich begrenzter Umschlag: { u: userId, ...extra, t: Zeit, n: Zufall }.
function makeEnvelope(payload, ttlMs) {
  const body = b64({ ...payload, t: Date.now(), n: crypto.randomBytes(8).toString('base64url'), ttl: ttlMs });
  return `${body}.${sig(body)}`;
}

function verifyEnvelope(token) {
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

// OAuth-State: trägt das Konto und ob die App (nicht der Browser) den Login gestartet hat. 10 Minuten gültig.
export const makeState = (userId, { native = false } = {}) => makeEnvelope({ u: userId, native: !!native }, 10 * 60 * 1000);
export const verifyState = (state) => verifyEnvelope(state);

// Einmal-Ticket: die App öffnet damit /api/google/start im System-Browser, ohne dort angemeldet zu sein. 5 Minuten.
export const makeTicket = (userId) => makeEnvelope({ u: userId, ticket: true }, 5 * 60 * 1000);
export const verifyTicket = (t) => { const p = verifyEnvelope(t); return p?.ticket ? p : null; };

export function authUrl(state, req) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
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

const tokKey = (userId) => ukey(userId, 'google_tokens');

export async function exchangeCode(code, req, userId) {
  const tok = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri(req) });
  if (!tok.refresh_token) throw new Error('Google hat keinen Refresh-Token geliefert. Zugriff unter myaccount.google.com/permissions entfernen und erneut verbinden.');
  let email = null;
  try {
    const info = await getJSON('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
    email = info.email || null;
  } catch { /* nur Anzeige */ }
  await saveJSON(tokKey(userId), {
    refresh: encrypt(tok.refresh_token),
    scope: tok.scope || SCOPES.join(' '),
    email,
    connectedAt: new Date().toISOString(),
  });
  cache.delete(userId);
  return { email };
}

export async function disconnect(userId) {
  cache.delete(userId);
  await deleteJSON(tokKey(userId));
}

export async function googleStatus(userId) {
  const t = await loadJSON(tokKey(userId));
  if (!t) return { configured: googleConfigured(), connected: false };
  return { configured: googleConfigured(), connected: true, email: t.email, connectedAt: t.connectedAt, scopes: (t.scope || '').split(' ').filter(Boolean), lastError: t.lastError || null };
}

// Access-Token-Cache je Konto (lebt nur solange die Serverless-Instanz).
const cache = new Map();

export async function getAccessToken(userId) {
  const c = cache.get(userId);
  if (c && c.exp > Date.now() + 60000) return c.token;
  const t = await loadJSON(tokKey(userId));
  if (!t) throw new Error('Google nicht verbunden. Unter „Einrichten" auf „Google verbinden" tippen.');
  try {
    const tok = await tokenRequest({ refresh_token: decrypt(t.refresh), grant_type: 'refresh_token' });
    cache.set(userId, { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 });
    if (t.lastError) await saveJSON(tokKey(userId), { ...t, lastError: null });
    return tok.access_token;
  } catch (e) {
    const msg = /invalid_grant/.test(e.message)
      ? 'Google-Zugriff abgelaufen oder widerrufen. Bitte unter „Einrichten" erneut verbinden.'
      : e.message;
    await saveJSON(tokKey(userId), { ...t, lastError: msg });
    throw new Error(msg);
  }
}

// Zugriff für die Quellen eines Kontos: { fetch, token }.
export function googleFor(userId) {
  const token = () => getAccessToken(userId);
  const fetch = async (url, init = {}) => {
    const tk = await token();
    return getJSON(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${tk}` } });
  };
  return { fetch, token };
}
