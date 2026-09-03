// Speicherung: lokal als JSON-Dateien in data/ – in der Cloud (Vercel) in einer
// Supabase-Tabelle (key text primary key, value jsonb). Umschaltung automatisch:
// Sind SUPABASE_URL + SUPABASE_SERVICE_KEY gesetzt, wird Supabase genutzt.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const TABLE = process.env.SUPABASE_TABLE || 'earnings_kv';

export function useSupabase() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

function sbHeaders() {
  return {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    'content-type': 'application/json',
  };
}

// Dateiname aus Schlüssel: "snapshot:2026-09-01" -> "snapshot_2026-09-01.json"
function fileFor(name) {
  return path.join(DATA_DIR, name.replace(/[^a-zA-Z0-9_.-]/g, '_') + (name.endsWith('.json') ? '' : '.json'));
}

export async function loadJSON(name, fallback = null) {
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

export async function deleteJSON(name) {
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
