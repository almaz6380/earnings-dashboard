// Speicherung. Drei Möglichkeiten, automatisch nach den gesetzten Umgebungsvariablen:
//
//   Redis     KV_REST_API_URL + KV_REST_API_TOKEN (oder UPSTASH_REDIS_REST_*)
//             In Vercel mit zwei Klicks dazubuchbar, die Variablen setzt Vercel selbst.
//             Passt am besten: die App speichert ohnehin nur Schlüssel und Werte.
//   Supabase  SUPABASE_URL + SUPABASE_SERVICE_KEY, Tabelle aus supabase.sql
//   lokal     sonst JSON-Dateien in data/ - für die Entwicklung
//
// Alle drei sprechen dieselben vier Funktionen: lesen, schreiben, auflisten, löschen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const TABLE = process.env.SUPABASE_TABLE || 'earnings_kv';

const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

export const useRedis = () => !!(redisUrl() && redisToken());
export const useSupabase = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
export const speicherArt = () => (useRedis() ? 'redis' : useSupabase() ? 'supabase' : 'lokal (data/)');

// ---- Redis über die REST-Schnittstelle -------------------------------------

// Ein Befehl als JSON-Array, damit Schlüssel mit ":" nicht in der Adresse landen.
async function redis(befehl) {
  const res = await fetch(redisUrl().replace(/\/$/, ''), {
    method: 'POST',
    headers: { authorization: `Bearer ${redisToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify(befehl),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Redis ${befehl[0]}: ${res.status} ${text.slice(0, 200)}`);
  let daten;
  try { daten = JSON.parse(text); } catch { throw new Error(`Redis ${befehl[0]}: unlesbare Antwort`); }
  if (daten?.error) throw new Error(`Redis ${befehl[0]}: ${String(daten.error).slice(0, 200)}`);
  return daten?.result;
}

// ---- Supabase ---------------------------------------------------------------

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'content-type': 'application/json',
  };
}

// ---- Lokale Dateien ---------------------------------------------------------

// Dateiname aus Schlüssel: "snapshot:2026-09-01" -> "snapshot_2026-09-01.json"
function fileFor(name) {
  return path.join(DATA_DIR, name.replace(/[^a-zA-Z0-9_.-]/g, '_') + (name.endsWith('.json') ? '' : '.json'));
}

// ---- Die vier Funktionen ----------------------------------------------------

export async function loadJSON(name, fallback = null) {
  if (useRedis()) {
    const roh = await redis(['GET', name]);
    if (roh == null) return fallback;
    try { return JSON.parse(roh); } catch { return fallback; }
  }
  if (useSupabase()) {
    const res = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(name)}&select=value`,
      { headers: sbHeaders() }
    );
    if (res.status === 404) return fallback; // Tabelle fehlt noch (supabase.sql ausführen)
    if (!res.ok) throw new Error(`Supabase lesen (${name}): ${res.status} ${(await res.text()).slice(0, 200)}`);
    const rows = await res.json();
    return rows[0]?.value ?? fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch {
    return fallback;
  }
}

export async function saveJSON(name, value) {
  if (useRedis()) {
    await redis(['SET', name, JSON.stringify(value)]);
    return;
  }
  if (useSupabase()) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=key`, {
      method: 'POST',
      headers: { ...sbHeaders(), prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ key: name, value, updated_at: new Date().toISOString() }]),
    });
    if (!res.ok) throw new Error(`Supabase schreiben (${name}): ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(fileFor(name), JSON.stringify(value, null, 1));
}

// Alle Schlüssel mit Präfix (z. B. "user:") - für den Sammellauf über alle Konten.
export async function listKeys(prefix) {
  if (useRedis()) {
    // SCAN statt KEYS: KEYS blockiert den Server, SCAN läuft in Häppchen.
    const gefunden = [];
    let cursor = '0';
    do {
      const antwort = await redis(['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', 1000]);
      cursor = String(antwort?.[0] ?? '0');
      for (const k of antwort?.[1] || []) gefunden.push(k);
      // Notbremse, falls der Cursor nie zurückkommt.
      if (gefunden.length > 100000) break;
    } while (cursor !== '0');
    return gefunden;
  }
  if (useSupabase()) {
    const pattern = encodeURIComponent(`${prefix}*`);
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${TABLE}?key=like.${pattern}&select=key&limit=10000`, { headers: sbHeaders() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Supabase auflisten (${prefix}): ${res.status}`);
    return (await res.json()).map((r) => r.key);
  }
  let files = [];
  try { files = fs.readdirSync(DATA_DIR); } catch { return []; }
  const safe = (k) => k.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return files.filter((f) => f.endsWith('.json') && f.startsWith(safe(prefix))).map((f) => f.slice(0, -5));
}

export async function deleteJSON(name) {
  if (useRedis()) {
    await redis(['DEL', name]);
    return;
  }
  if (useSupabase()) {
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${TABLE}?key=eq.${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase löschen (${name}): ${res.status}`);
    return;
  }
  try { fs.unlinkSync(fileFor(name)); } catch { /* schon weg */ }
}
