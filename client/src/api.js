// Ein Weg zur API für Browser und native App.
//
// Im Browser: relative Pfade, Anmeldung per HttpOnly-Cookie, nichts zu tun.
// In der App (iOS/Android): der Client liegt in der App selbst, die API auf dem
// eigenen Server. Die Adresse wird einmal eingegeben, das Token kommt vom Login
// und wandert als "Authorization: Bearer" mit - beides bleibt in den nativen
// Preferences (auf iOS im App-Container, auf Android in SharedPreferences).
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const NATIV = Capacitor.isNativePlatform();
export const PLATTFORM = Capacitor.getPlatform(); // 'web' | 'ios' | 'android'

let server = '';   // '' = gleiche Domain (Browser)
let token = null;

export function normalizeServer(url) {
  let u = String(url || '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

export async function initApi() {
  if (!NATIV) return;
  const [s, t] = await Promise.all([Preferences.get({ key: 'server' }), Preferences.get({ key: 'token' })]);
  server = normalizeServer(s.value || '');
  token = t.value || null;
}

export function getServer() { return server; }

export async function setServer(url) {
  server = normalizeServer(url);
  if (NATIV) await Preferences.set({ key: 'server', value: server });
}

export async function setToken(t) {
  token = t || null;
  if (!NATIV) return;
  if (token) await Preferences.set({ key: 'token', value: token });
  else await Preferences.remove({ key: 'token' });
}

export function hasToken() { return !!token; }

export function apiUrl(path) { return `${server}${path}`; }

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(apiUrl(path), { credentials: 'same-origin', ...opts, headers });
  } catch {
    const msg = NATIV
      ? `Server nicht erreichbar${server ? ` (${server})` : ''}. Adresse und Internetverbindung prüfen.`
      : 'Netzwerkfehler. Bitte erneut versuchen.';
    throw Object.assign(new Error(msg), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.fehler || `HTTP ${res.status}`), { status: res.status });
  return data;
}
