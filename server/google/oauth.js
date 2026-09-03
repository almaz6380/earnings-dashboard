// Ein Google-Login für AdMob, AdSense und Play-Finanzberichte (Cloud Storage).
// Refresh-Token liegt AES-verschlüsselt im Speicher (Schlüssel google_tokens).
import crypto from 'node:crypto';
import { loadJSON, saveJSON, deleteJSON } from '../store.js';
import { encrypt, decrypt } from '../crypto.js';
import { getJSON } from '../http.js';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/admob.readonly',
  'https://www.googleapis.com/auth/adsense.readonly',
  'https://www.googleapis.com/auth/devstorage.read_only',
];

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri() {
  return `${(process.env.PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/google/callback`;
}

function stateSecret() {
  return process.env.SESSION_SECRET || 'dev';
}

export function makeState() {
  const nonce = crypto.randomBytes(12).toString('base64url') + '.' + Date.now();
  return `${nonce}.${crypto.createHmac('sha256', stateSecret()).update(nonce).digest('base64url')}`;
}

export function verifyState(state) {
  if (!state) return false;
  const i = state.lastIndexOf('.');
  const nonce = state.slice(0, i), sig = state.slice(i + 1);
  const want = crypto.createHmac('sha256', stateSecret()).update(nonce).digest('base64url');
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return false;
  const ts = Number(nonce.split('.')[1]);
  return Date.now() - ts < 10 * 60 * 1000;
}

export function authUrl(state) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
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

export async function exchangeCode(code) {
  const tok = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!tok.refresh_token) throw new Error('Google hat keinen Refresh-Token geliefert. Zugriff unter myaccount.google.com/permissions entfernen und erneut verbinden.');
  let email = null;
  try {
    const info = await getJSON('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } });
    email = info.email || null;
  } catch { /* nur Anzeige */ }
  await saveJSON('google_tokens', {
    refresh: encrypt(tok.refresh_token),
    scope: tok.scope || SCOPES.join(' '),
    email,
    connectedAt: new Date().toISOString(),
  });
  return { email };
}

export async function disconnect() {
  await deleteJSON('google_tokens');
}

export async function googleStatus() {
  const t = await loadJSON('google_tokens');
  if (!t) return { configured: googleConfigured(), connected: false };
  return { configured: googleConfigured(), connected: true, email: t.email, connectedAt: t.connectedAt, scopes: (t.scope || '').split(' ').filter(Boolean), lastError: t.lastError || null };
}

let cache = { token: null, exp: 0 };

export async function getAccessToken() {
  if (cache.token && cache.exp > Date.now() + 60000) return cache.token;
  const t = await loadJSON('google_tokens');
  if (!t) throw new Error('Google nicht verbunden. Im Tab „Quellen" auf „Google verbinden" tippen.');
  try {
    const tok = await tokenRequest({ refresh_token: decrypt(t.refresh), grant_type: 'refresh_token' });
    cache = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 };
    if (t.lastError) await saveJSON('google_tokens', { ...t, lastError: null });
    return cache.token;
  } catch (e) {
    const msg = /invalid_grant/.test(e.message)
      ? 'Google-Token abgelaufen oder widerrufen (bei OAuth-Apps im Status „Testing" nach 7 Tagen). Bitte erneut verbinden; dauerhaft hilft „In production" in der Cloud Console.'
      : e.message;
    await saveJSON('google_tokens', { ...t, lastError: msg });
    throw new Error(msg);
  }
}

export async function googleFetch(url, init = {}) {
  const token = await getAccessToken();
  return getJSON(url, { ...init, headers: { ...(init.headers || {}), authorization: `Bearer ${token}` } });
}
