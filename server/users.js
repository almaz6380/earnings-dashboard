// Konten: E-Mail + Passwort (scrypt), Einstellungen und die verschlüsselte Konfiguration
// der Quellen. Alles im Schlüssel-Wert-Speicher:
//   user:<id>        Konto
//   email:<email>    -> { id }
//   u:<id>:history   Verlauf, u:<id>:latest letzter Lauf, u:<id>:google_tokens Google
import crypto from 'node:crypto';
import { loadJSON, saveJSON, deleteJSON, listKeys } from './store.js';
import { encrypt, decrypt } from './crypto.js';

export const MIN_PW = 10;
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

export const userKey = (id) => `user:${id}`;
const emailKey = (email) => `email:${normEmail(email)}`;
// Datei- bzw. Zeilenschlüssel für Nutzerdaten. Lokal wird ":" zu "_" - das macht store.js.
export const ukey = (id, name) => `u:${id}:${name}`;

// Kosten der Passwortableitung je Format. Das Format steht vorn im gespeicherten Wert,
// damit alte und neue Hashes nebeneinander prüfbar bleiben.
//
// Seit dem Umzug auf Cloudflare Workers (Free: 10 ms CPU je Aufruf) wird mit N=2048
// gehasht - gemessen rund 4 ms. N=16384 braucht dort 40-50 ms, jede Anmeldung bräche ab.
// Mit r=8 und einem langen Mindestpasswort (MIN_PW) bleibt das für ein privates
// Dashboard vertretbar; die Anmeldebremse in auth.js begrenzt Durchprobieren zusätzlich.
const SCRYPT = {
  scrypt: { N: 16384, r: 8, p: 1 },
  'scrypt-n2048': { N: 2048, r: 8, p: 1 },
};
const AKTUELL = 'scrypt-n2048';

// Im Worker (NUR_GUENSTIGE_HASHES=1) wird ein alter N=16384-Hash gar nicht erst geprüft:
// Er würde das CPU-Limit sprengen, und der Nutzer sähe nur einen abgebrochenen Aufruf
// statt des Hinweises, das Passwort einmal über "Passwort vergessen" neu zu setzen.
export function hashZuTeuer(stored) {
  return process.env.NUR_GUENSTIGE_HASHES === '1' && String(stored || '').split('.')[0] === 'scrypt';
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64, SCRYPT[AKTUELL]);
  return `${AKTUELL}.${salt.toString('base64')}.${hash.toString('base64')}`;
}

export function checkPassword(pw, stored) {
  if (typeof pw !== 'string' || typeof stored !== 'string') return false;
  const [alg, salt, hash] = stored.split('.');
  const params = Object.hasOwn(SCRYPT, alg) ? SCRYPT[alg] : null;
  if (!params || !salt || !hash || hashZuTeuer(stored)) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, params);
  return crypto.timingSafeEqual(got, want);
}

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PW) return `Passwort bitte mindestens ${MIN_PW} Zeichen.`;
  if (pw.length > 200) return 'Passwort zu lang.';
  return null;
}

export async function getUser(id) {
  if (!id || typeof id !== 'string') return null;
  return loadJSON(userKey(id));
}

export async function findByEmail(email) {
  const ref = await loadJSON(emailKey(email));
  return ref?.id ? getUser(ref.id) : null;
}

export async function saveUser(u) {
  await saveJSON(userKey(u.id), u);
}

export async function listUserIds() {
  return (await listKeys('user:')).map((k) => k.slice('user:'.length)).filter(Boolean);
}

export async function createUser({ email, password }) {
  const e = normEmail(email);
  if (!emailOk(e)) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');
  const pp = passwordProblem(password);
  if (pp) throw new Error(pp);
  if (await loadJSON(emailKey(e))) throw new Error('Für diese E-Mail-Adresse gibt es schon ein Konto.');
  const id = crypto.randomBytes(9).toString('base64url');
  const u = { id, email: e, pw: hashPassword(password), pwv: 1, createdAt: new Date().toISOString(), settings: {}, config: null };
  await saveJSON(emailKey(e), { id });
  await saveUser(u);
  return u;
}

// Neues Passwort: pwv steigt, damit alte Sitzungen (Cookie/App-Token) ungültig werden.
export async function setPassword(u, password) {
  const pp = passwordProblem(password);
  if (pp) throw new Error(pp);
  u.pw = hashPassword(password);
  u.pwv = (u.pwv || 1) + 1;
  await saveUser(u);
  return u;
}

export async function setSettings(u, patch) {
  const erlaubt = ['baseCurrency', 'telegramChatId', 'ntfyTopic', 'notify'];
  u.settings ||= {};
  for (const k of erlaubt) {
    if (!(k in (patch || {}))) continue;
    const v = patch[k];
    if (v === '' || v == null) delete u.settings[k];
    else if (k === 'notify') u.settings.notify = !!v;
    else if (k === 'baseCurrency') u.settings.baseCurrency = String(v).trim().toUpperCase().slice(0, 3);
    else u.settings[k] = String(v).trim().slice(0, 200);
  }
  await saveUser(u);
  return u.settings;
}

// Konto und alles, was dazugehört, unwiderruflich löschen (Store-Pflicht).
export async function deleteUser(u) {
  for (const name of ['history', 'latest', 'google_tokens']) await deleteJSON(ukey(u.id, name));
  await deleteJSON(emailKey(u.email));
  await deleteJSON(userKey(u.id));
}

// Konfiguration der Quellen als Ganzes AES-verschlüsselt im Konto. Welche Form der
// Inhalt hat und wie ältere Formen übersetzt werden, steht in quellen.js - hier geht
// es nur um Ver- und Entschlüsseln.
export function getConfig(u) {
  if (!u?.config) return {};
  try { return JSON.parse(decrypt(u.config)); } catch { return {}; }
}

export async function setConfig(u, cfg) {
  const leer = !cfg || (cfg.quellen && !Object.keys(cfg.quellen).length);
  u.config = leer ? null : encrypt(JSON.stringify(cfg));
  await saveUser(u);
  return cfg;
}

export function publicUser(u) {
  return { id: u.id, email: u.email, createdAt: u.createdAt, settings: u.settings || {} };
}
