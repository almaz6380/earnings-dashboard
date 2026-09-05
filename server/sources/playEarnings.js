// Google Play: monatliche Earnings-Berichte (echte Auszahlungsbeträge) aus dem Cloud-Storage-Bucket.
// Datei: earnings/earnings_YYYYMM-<id>.zip -> CSV mit "Amount (Merchant Currency)".
import { getAccessToken } from '../google/oauth.js';
import { getJSON, getBuffer } from '../http.js';
import { unzip } from '../zip.js';
import { parseDelimited, toObjects, parseNumber } from '../csv.js';

export const meta = { id: 'play', label: 'Google Play', art: 'Auszahlung (tatsächlich)', kind: 'payout',
  needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'PLAY_GCS_BUCKET'], google: true };

export function configured() {
  return !!(process.env.PLAY_GCS_BUCKET && process.env.GOOGLE_CLIENT_ID);
}

export async function fetchData({ months = 2 } = {}) {
  const bucket = process.env.PLAY_GCS_BUCKET.replace(/^gs:\/\//, '').replace(/\/.*$/, '');
  const token = await getAccessToken();
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const list = await getJSON(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=earnings/&fields=items(name,updated)`, auth);
  const files = (list.items || []).filter((f) => /earnings_\d{6}/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(-months);
  if (!files.length) return { currency: null, asOf: new Date().toISOString(), daily: [], payouts: [], balance: null, extra: {}, note: 'Noch kein Earnings-Bericht im Bucket.' };

  const daily = [], payouts = [], apps = [];
  let currency = null;
  for (const f of files) {
    const zip = await getBuffer(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(f.name)}?alt=media`, auth);
    const month = f.name.match(/earnings_(\d{4})(\d{2})/).slice(1).join('-');
    for (const entry of unzip(zip)) {
      if (!/\.csv$/i.test(entry.name)) continue;
      const r = parseEarningsCsv(entry.data.toString('utf8'));
      currency = r.currency || currency;
      daily.push(...r.daily);
      apps.push(...r.apps);
      payouts.push({ month, amount: r.total, currency: r.currency, label: `Play-Auszahlung ${month}` });
    }
  }
  return { currency, asOf: files.at(-1).updated || new Date().toISOString(), daily, payouts, apps, balance: null, extra: {},
    note: 'Earnings-Bericht entsteht Anfang des Folgemonats und entspricht der Auszahlung.' };
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

export function parseEarningsCsv(text) {
  const rows = toObjects(parseDelimited(text));
  const perDay = {};
  const perApp = new Map();
  let currency = null, total = 0;
  for (const r of rows) {
    const amt = parseNumber(r['Amount (Merchant Currency)']);
    if (Number.isNaN(amt)) continue;
    currency = r['Merchant Currency'] || currency;
    const date = parseDate(r['Transaction Date']);
    if (date) perDay[date] = (perDay[date] || 0) + amt;
    total += amt;
    const name = (r['Product Title'] || '').trim();
    const id = (r['Product id'] || name).trim();
    if (date && name) {
      const key = `${id}|${date}`;
      const vorher = perApp.get(key) || { id, name, date, amount: 0, currency };
      vorher.amount = Math.round((vorher.amount + amt) * 100) / 100;
      vorher.currency = currency;
      perApp.set(key, vorher);
    }
  }
  const daily = Object.entries(perDay).sort().map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100, currency }));
  return { currency, total: Math.round(total * 100) / 100, daily, apps: [...perApp.values()] };
}

// "Jul 1, 2026" oder "2026-07-01" -> "2026-07-01"
export function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = String(s).match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if (mo === undefined) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}
