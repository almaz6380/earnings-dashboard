// Sitzungen: signiertes Token "<userId>.<pwv>.<exp>.<sig>" (HMAC-SHA256 über SESSION_SECRET),
// im Browser als HttpOnly-Cookie, in der App als "Authorization: Bearer". pwv ist die
// Passwort-Version des Kontos: ein neues Passwort macht alle alten Tokens ungültig.
// Login-Bremse: 5 Fehlversuche je IP+E-Mail -> 15 Minuten Sperre.
import crypto from 'node:crypto';
import { loadJSON, saveJSON } from './store.js';
import { findByEmail, checkPassword, hashZuTeuer, getUser, normEmail } from './users.js';

export const COOKIE = 'ed_session';
export const TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

export function makeToken(user, now = Date.now()) {
  const body = `${user.id}.${user.pwv || 1}.${now + TTL_MS}`;
  return `${body}.${sign(body)}`;
}

// Gibt { id, pwv } zurück oder null.
export function verifyToken(token, now = Date.now()) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [id, pwv, exp, sig] = parts;
  if (!id || !/^\d+$/.test(pwv) || !/^\d+$/.test(exp)) return null;
  const expected = sign(`${id}.${pwv}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (Number(exp) <= now) return null;
  return { id, pwv: Number(pwv) };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function bearerToken(req) {
  const h = req.headers?.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

// Token aus Cookie oder Bearer prüfen (ohne Speicherzugriff). { id, pwv } oder null.
export function sessionOf(req) {
  return verifyToken(parseCookies(req.headers?.cookie)[COOKIE]) || verifyToken(bearerToken(req));
}

export const isAuthed = (req) => !!sessionOf(req);

// Konto zur Sitzung laden; null, wenn Token ungültig, Konto weg oder Passwort geändert.
export async function currentUser(req) {
  const s = sessionOf(req);
  if (!s) return null;
  const u = await getUser(s.id);
  if (!u || (u.pwv || 1) !== s.pwv) return null;
  return u;
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

export function clientIp(req) {
  return (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unbekannt';
}

// Zähler für Fehlversuche je Schlüssel (IP+E-Mail beim Login, IP bei Registrierung).
async function bremse(key, now) {
  const fails = (await loadJSON('login_fails', {})) || {};
  // Alte Einträge aufräumen, damit die Liste nicht wächst.
  for (const [k, e] of Object.entries(fails)) if ((e.until || 0) < now - LOCK_MS && (e.at || 0) < now - LOCK_MS) delete fails[k];
  return { fails, entry: fails[key] || { n: 0, until: 0, at: now } };
}

// Prüft E-Mail + Passwort inkl. Bremse. Gibt { ok, user } oder { ok: false, wartenSek, verbleibend }.
export async function tryLogin(req, email, password, now = Date.now()) {
  const key = `${clientIp(req)}|${normEmail(email)}`;
  const { fails, entry } = await bremse(key, now);
  if (entry.until > now) return { ok: false, wartenSek: Math.ceil((entry.until - now) / 1000) };
  const u = await findByEmail(email);
  // Kein Fehlversuch: Das Passwort kann stimmen, es ist nur mit dem alten, teuren
  // Verfahren gespeichert, das der Worker nicht mehr prüft.
  if (u && hashZuTeuer(u.pw)) return { ok: false, veraltet: true };
  if (u && checkPassword(password, u.pw)) {
    if (fails[key]) { delete fails[key]; await saveJSON('login_fails', fails); }
    return { ok: true, user: u };
  }
  entry.n += 1; entry.at = now;
  if (entry.n >= MAX_FAILS) { entry.n = 0; entry.until = now + LOCK_MS; }
  fails[key] = entry;
  await saveJSON('login_fails', fails);
  return { ok: false, wartenSek: entry.until > now ? Math.ceil(LOCK_MS / 1000) : 0, verbleibend: MAX_FAILS - entry.n };
}

// Registrierungen je IP begrenzen (10 pro 15 Minuten).
export async function signupAllowed(req, now = Date.now()) {
  const key = `signup|${clientIp(req)}`;
  const { fails, entry } = await bremse(key, now);
  if (entry.until > now) return false;
  entry.n += 1; entry.at = now;
  if (entry.n >= 10) { entry.n = 0; entry.until = now + LOCK_MS; }
  fails[key] = entry;
  await saveJSON('login_fails', fails);
  return true;
}

// Wrapper für Handler: ohne gültige Sitzung 401, sonst req.user gesetzt.
export function requireAuth(handler) {
  return async (req, res) => {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
    req.user = u;
    return handler(req, res);
  };
}

// Cron-/Skript-Zugang: ?secret= oder Authorization: Bearer (so ruft Vercel-Cron auf).
export function cronOk(req) {
  const secret = req.query?.secret ?? bearerToken(req);
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}
