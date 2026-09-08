// AdSense Management API v2: Tageseinnahmen + offenes Guthaben ("unpaid").
import { parseNumber } from '../csv.js';

export const meta = { id: 'adsense', label: 'AdSense', art: 'Web-Werbung', kind: 'earned',
  needs: ['ADSENSE_ACCOUNT_ID'], google: true, mehrfach: true, entdeckbar: true,
  konsole: { url: 'https://www.google.com/adsense', text: 'AdSense öffnen' },
  help: 'Nur nötig, wenn du AdSense für Webseiten nutzt. Wähle die Google-Verbindung, den Rest suchen wir.',
  felder: [{ key: 'ADSENSE_ACCOUNT_ID', label: 'Publisher-ID', hint: 'Form pub-1234567890123456' }] };

export const vollstaendig = (e) => !!e?.ADSENSE_ACCOUNT_ID;

export async function entdecke({ google }) {
  const r = await google.fetch('https://adsense.googleapis.com/v2/accounts?pageSize=50');
  return (r.accounts || [])
    .map((a) => ({ id: String(a.name || '').replace(/^accounts\//, ''), displayName: a.displayName }))
    .filter((a) => a.id)
    .map((a) => ({ werte: { ADSENSE_ACCOUNT_ID: a.id }, label: a.id, hinweis: a.displayName || null }));
}

export async function fetchData({ eintrag = {}, google } = {}) {
  const googleFetch = google.fetch;
  const acc = String(eintrag.ADSENSE_ACCOUNT_ID || '').replace(/^accounts\//, '');
  const q = new URLSearchParams({ dateRange: 'LAST_30_DAYS', dimensions: 'DATE', metrics: 'ESTIMATED_EARNINGS' });
  const rep = await googleFetch(`https://adsense.googleapis.com/v2/accounts/${acc}/reports:generate?${q}`);
  const pay = await googleFetch(`https://adsense.googleapis.com/v2/accounts/${acc}/payments`).catch(() => ({ payments: [] }));
  return parse(rep, pay);
}

const SYMBOLS = { '€': 'EUR', '$': 'USD', '£': 'GBP', 'CHF': 'CHF' };

export function parse(rep, pay) {
  const hdr = (rep.headers || []).find((h) => h.name === 'ESTIMATED_EARNINGS');
  const currency = hdr?.currencyCode || 'EUR';
  const daily = (rep.rows || []).map((r) => ({ date: r.cells?.[0]?.value, amount: Number(r.cells?.[1]?.value || 0), currency }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date || ''));
  const unpaid = (pay.payments || []).find((p) => /\/unpaid$/.test(p.name || ''));
  let balance = null;
  if (unpaid?.amount) {
    const sym = Object.keys(SYMBOLS).find((s) => unpaid.amount.includes(s));
    balance = { amount: parseNumber(unpaid.amount), currency: sym ? SYMBOLS[sym] : currency, label: 'Offenes AdSense-Guthaben' };
  }
  return { currency, asOf: new Date().toISOString(), daily, balance, extra: {}, note: null };
}
