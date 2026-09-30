// App Store Connect API: Tagesverkäufe (Sales Report, Schätzung der Auszahlung) und
// monatliche Finanzberichte (tatsächliche Auszahlung je Fiskalmonat). JWT ES256 ohne Fremdpaket.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { getBuffer, ymd, daysAgo } from '../http.js';
import { parseDelimited, toObjects, parseNumber } from '../csv.js';

export const meta = { id: 'appstore', schwer: true, label: 'App Store', art: 'Erlöse (Sales) + Auszahlung (Finance)', kind: 'payout',
  needs: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER'], mehrfach: true,
  konsole: { url: 'https://appstoreconnect.apple.com/access/integrations/api', text: 'App-Store-Connect-Schlüssel' },
  // Apple bietet für Finanzberichte keinen Login für Fremd-Apps an - nur einen
  // Schlüssel, den du selbst erzeugst. Die Vendor-Nummer gibt keine Schnittstelle heraus.
  help: 'Nutzer und Zugriff → Integrationen → App Store Connect API → Team-Schlüssel mit Rolle „Finance" erzeugen und die .p8-Datei laden.',
  felder: [
    { key: 'ASC_KEY_ID', label: 'Key-ID' },
    { key: 'ASC_ISSUER_ID', label: 'Issuer-ID', hint: 'steht über der Schlüsselliste' },
    { key: 'ASC_PRIVATE_KEY', label: 'Privater Schlüssel (.p8)', secret: true, multiline: true, datei: '.p8', hint: 'Datei auswählen oder Inhalt einfügen' },
    { key: 'ASC_VENDOR_NUMBER', label: 'Vendor-Nummer', hint: 'Zahlungen und Finanzberichte → oben links' },
  ] };

export const vollstaendig = (e) => !!(e?.ASC_KEY_ID && e?.ASC_ISSUER_ID && e?.ASC_PRIVATE_KEY && e?.ASC_VENDOR_NUMBER);

export function privateKey(cfg) {
  const raw = String(cfg.ASC_PRIVATE_KEY || '').trim();
  return raw.startsWith('-----') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8');
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

export function makeJwt({ kid, iss, key, now = Math.floor(Date.now() / 1000) }) {
  const input = `${b64({ alg: 'ES256', kid, typ: 'JWT' })}.${b64({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

// Adresse eines Berichts. Der Pfad-Baustein darf NICHT in die Abfrage geraten -
// Apple lehnt unbekannte Parameter mit 400 ab.
export function reportUrl(path, filter) {
  return `https://api.appstoreconnect.apple.com/v1/${path}?${new URLSearchParams(filter)}`;
}

// Apples Fehlerantwort ist JSON; brauchbar ist darin "detail", nicht die Fehler-ID.
export function appleFehler(e) {
  try {
    const erste = JSON.parse(e.body || '').errors?.[0];
    if (erste) return [erste.code, erste.detail || erste.title].filter(Boolean).join(': ').slice(0, 200);
  } catch { /* kein JSON, dann die rohe Meldung */ }
  return String(e.message || e).slice(0, 200);
}

// Gleiche Fehler nicht 17-mal auflisten, sondern zählen.
export function zusammenfassen(liste) {
  const anzahl = new Map();
  for (const t of liste) anzahl.set(t, (anzahl.get(t) || 0) + 1);
  return [...anzahl].map(([t, n]) => (n > 1 ? `${n}× ${t}` : t)).join(' | ');
}

async function report(cfg, path, filter) {
  const jwt = makeJwt({ kid: cfg.ASC_KEY_ID, iss: cfg.ASC_ISSUER_ID, key: privateKey(cfg) });
  const buf = await getBuffer(reportUrl(path, filter), {
    headers: { authorization: `Bearer ${jwt}`, accept: 'application/a-gzip' },
  });
  return (buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString('utf8');
}

export async function fetchData({ eintrag: cfg = {}, days = 14, knownDates = new Set(), knownMonths = new Set() } = {}) {
  const vendor = cfg.ASC_VENDOR_NUMBER;
  const daily = [], payouts = [], apps = [], errors = [];
  let currency = null;

  // Tagesverkäufe: fehlende Tage der letzten `days` Tage (Bericht kommt am Folgetag)
  for (let i = days; i >= 1; i--) {
    const date = ymd(daysAgo(i));
    if (knownDates.has(date) && i > 3) continue;
    try {
      const tsv = await report(cfg, 'salesReports', { 'filter[frequency]': 'DAILY', 'filter[reportSubType]': 'SUMMARY',
        'filter[reportType]': 'SALES', 'filter[vendorNumber]': vendor, 'filter[reportDate]': date });
      const sums = sumSales(tsv);
      for (const [cur, amount] of Object.entries(sums)) { daily.push({ date, amount, currency: cur }); currency = currency || cur; }
      if (!Object.keys(sums).length) daily.push({ date, amount: 0, currency: currency || 'USD' });
      for (const a of salesByApp(tsv)) apps.push({ ...a, date });
    } catch (e) {
      if (e.status === 404) daily.push({ date, amount: 0, currency: currency || 'USD' });
      else errors.push(`Tagesverkäufe: ${appleFehler(e)}`);
    }
  }

  // Finanzberichte: letzte 3 Fiskalmonate, sofern noch unbekannt
  for (let m = 1; m <= 3; m++) {
    const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - m);
    const month = d.toISOString().slice(0, 7);
    if (knownMonths.has(month)) continue;
    try {
      const tsv = await report(cfg, 'financeReports', { 'filter[regionCode]': 'ZZ', 'filter[reportType]': 'FINANCIAL',
        'filter[vendorNumber]': vendor, 'filter[reportDate]': month });
      for (const [cur, amount] of Object.entries(sumFinance(tsv))) payouts.push({ month, amount, currency: cur, label: `App-Store-Auszahlung Fiskalmonat ${month}` });
    } catch (e) {
      if (e.status !== 404) errors.push(`Finanzbericht: ${appleFehler(e)}`);
    }
  }
  return { currency: currency || 'USD', asOf: new Date().toISOString(), daily, payouts, apps, balance: null, extra: {},
    note: [errors.length ? `Fehler: ${zusammenfassen(errors)}` : null, 'Apple rechnet in Fiskalmonaten ab; Finanzbericht ca. 5 Tage nach Monatsende.'].filter(Boolean).join(' ') };
}

// Sales-Report: Summe Units × Developer Proceeds je "Currency of Proceeds"
export function sumSales(tsv) {
  const out = {};
  for (const r of toObjects(parseDelimited(tsv, '\t'))) {
    const units = parseNumber(r['Units']), proceeds = parseNumber(r['Developer Proceeds']);
    const cur = (r['Currency of Proceeds'] || '').trim();
    if (!cur || Number.isNaN(units) || Number.isNaN(proceeds)) continue;
    out[cur] = Math.round(((out[cur] || 0) + units * proceeds) * 100) / 100;
  }
  return out;
}

// Sales-Report je App: Titel als Name, SKU oder Apple-ID als Kennung.
export function salesByApp(tsv) {
  const proApp = new Map();
  for (const r of toObjects(parseDelimited(tsv, '\t'))) {
    const units = parseNumber(r['Units']), proceeds = parseNumber(r['Developer Proceeds']);
    const cur = (r['Currency of Proceeds'] || '').trim();
    const name = (r['Title'] || '').trim();
    const id = (r['Apple Identifier'] || r['SKU'] || name).trim();
    if (!cur || !name || Number.isNaN(units) || Number.isNaN(proceeds)) continue;
    const key = `${id}|${cur}`;
    // Die Apple-Kennung ist rein numerisch; nur damit findet man das Icon im Store.
    const vorher = proApp.get(key) || { id, name, currency: cur, amount: 0, ...(/^\d+$/.test(id) ? { platform: 'ios', storeId: id } : {}) };
    vorher.amount = Math.round((vorher.amount + units * proceeds) * 100) / 100;
    proApp.set(key, vorher);
  }
  return [...proApp.values()];
}

// Finanzbericht: Summe "Extended Partner Share" je "Partner Share Currency"
export function sumFinance(tsv) {
  const out = {};
  for (const r of toObjects(parseDelimited(tsv, '\t'))) {
    const amt = parseNumber(r['Extended Partner Share']);
    const cur = (r['Partner Share Currency'] || '').trim();
    if (!cur || Number.isNaN(amt)) continue;
    out[cur] = Math.round(((out[cur] || 0) + amt) * 100) / 100;
  }
  return out;
}
