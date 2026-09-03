// Passwortschutz: DASHBOARD_PASSWORD -> signiertes HttpOnly-Cookie (HMAC-SHA256 über SESSION_SECRET).
// Login-Bremse: nach 5 Fehlversuchen 15 Minuten Sperre (Zähler im Speicher).
import crypto from 'node:crypto';
import { loadJSON, saveJSON } from './store.js';

export const COOKIE = 'ed_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET fehlt oder ist zu kurz (mind. 16 Zeichen).');
  return s;
}

function sign(data) {
  return crypto.createHmac('sha256', secret()).update(data).digest('base64url');
}

export function makeToken(now = Date.now()) {
  const exp = String(now + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  const expected = sign(exp);
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(exp) > now;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthed(req) {
  return verifyToken(parseCookies(req.headers?.cookie)[COOKIE]);
}

export function cookieHeader(value, { maxAgeSec, secure } = {}) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSec !== undefined) parts.push(`Max-Age=${maxAgeSec}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function isSecure(req) {
  return (req.headers?.['x-forwarded-proto'] || '').startsWith('https') || (process.env.PUBLIC_URL || '').startsWith('https');
}

function clientIp(req) {
  return (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unbekannt';
}

function passwordOk(given) {
  const want = process.env.DASHBOARD_PASSWORD || '';
  if (!want || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Prüft Passwort inkl. Bremse. Gibt { ok, wartenSek } zurück.
export async function tryLogin(req, password, now = Date.now()) {
  const fails = (await loadJSON('login_fails', {})) || {};
  const ip = clientIp(req);
  const entry = fails[ip] || { n: 0, until: 0 };
  if (entry.until > now) return { ok: false, wartenSek: Math.ceil((entry.until - now) / 1000) };
  if (passwordOk(password)) {
    if (fails[ip]) { delete fails[ip]; await saveJSON('login_fails', fails); }
    return { ok: true };
  }
  entry.n += 1;
  if (entry.n >= MAX_FAILS) { entry.n = 0; entry.until = now + LOCK_MS; }
  fails[ip] = entry;
  await saveJSON('login_fails', fails);
  return { ok: false, wartenSek: entry.until > now ? Math.ceil(LOCK_MS / 1000) : 0, verbleibend: MAX_FAILS - entry.n };
}

// Wrapper für Handler: ohne gültiges Cookie 401.
export function requireAuth(handler) {
  return async (req, res) => {
    if (!isAuthed(req)) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
    return handler(req, res);
  };
}

// Cron-/Skript-Zugang: ?secret= oder Authorization: Bearer (so ruft Vercel-Cron auf).
export function cronOk(req) {
  const secret = req.query?.secret ?? req.headers?.authorization?.replace('Bearer ', '');
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}
