// Google Play: monatliche Earnings-Berichte (echte Auszahlungsbeträge) aus dem Cloud-Storage-Bucket.
// Datei: earnings/earnings_YYYYMM-<id>.zip -> CSV mit "Amount (Merchant Currency)".
import { getJSON, getBuffer } from '../http.js';
import { unzip } from '../zip.js';
import { parseDelimited, toObjects, parseNumber } from '../csv.js';

export const meta = { id: 'play', schwer: true, label: 'Google Play', art: 'Auszahlung (tatsächlich)', kind: 'payout',
  needs: ['PLAY_GCS_BUCKET'], google: true, mehrfach: true,
  konsole: { url: 'https://play.google.com/console', text: 'Play Console öffnen' },
  // Den Bucket-Namen gibt keine Programmierschnittstelle heraus - der muss aus der Konsole kommen.
  help: 'Play Console → Berichte herunterladen → Finanzberichte → „Cloud Storage-URI kopieren". Dein Google-Konto braucht dort „Finanzdaten ansehen".',
  felder: [{ key: 'PLAY_GCS_BUCKET', label: 'Cloud-Storage-Bucket', hint: 'nur der Name: pubsite_prod_rev_0123456789' }] };

export const vollstaendig = (e) => !!e?.PLAY_GCS_BUCKET;

// fetchJSON/fetchBuffer/holeToken sind einspeisbar, damit Tests ohne Netz laufen (wie in revenuecat.js).
export async function fetchData({ eintrag = {}, google, months = 2, fetchJSON = getJSON, fetchBuffer = getBuffer, holeToken = google?.token } = {}) {
  const bucket = String(eintrag.PLAY_GCS_BUCKET || '').replace(/^gs:\/\//, '').replace(/\/.*$/, '');
  const token = await holeToken();
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const leer = (note) => ({ currency: null, asOf: new Date().toISOString(), daily: [], payouts: [], apps: [], balance: null, extra: {}, note });

  let list;
  try {
    list = await fetchJSON(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=earnings/&fields=items(name,updated)`, auth);
  } catch (e) {
    // Solange es keinen einzigen Finanzbericht gab, legt Google den Bucket gar nicht erst an.
    // Das ist kein Fehler, sondern ein "noch nichts da" - sonst stünde die Quelle dauerhaft auf Rot.
    // Ein 404 hat zwei mögliche Ursachen, die von außen nicht zu unterscheiden sind:
    // der Bucket existiert noch nicht (kein Play-Umsatz), oder der Name stimmt nicht.
    // Beides ist kein Grund, die Quelle dauerhaft auf Rot zu stellen - aber im Hinweis stehen beide.
    if (/ -> 404:/.test(e.message)) return leer(`Kein Earnings-Bericht abrufbar: den Bucket "${bucket}" gibt es nicht. Entweder hat Google ihn noch nicht angelegt (er entsteht erst mit dem ersten Play-Umsatz aus bezahlten Apps, In-App-Käufen oder Abos - Werbeeinnahmen laufen über AdMob), oder der Name in PLAY_GCS_BUCKET stimmt nicht.`);
    throw e;
  }
  const files = (list.items || []).filter((f) => /earnings_\d{6}/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)).slice(-months);
  if (!files.length) return leer('Noch kein Earnings-Bericht im Bucket. Google erstellt ihn Anfang des Folgemonats, sobald über Google Play Geld eingenommen wurde.');

  const daily = [], payouts = [], apps = [];
  let currency = null;
  for (const f of files) {
    const zip = await fetchBuffer(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(f.name)}?alt=media`, auth);
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
      // Die Produkt-Kennung ist der Paketname (com.beispiel.app) - damit findet man das Icon.
      const vorher = perApp.get(key) || { id, name, date, amount: 0, currency, ...(/^[a-z][\w.]*\.\w+$/i.test(id) ? { platform: 'android', storeId: id } : {}) };
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
