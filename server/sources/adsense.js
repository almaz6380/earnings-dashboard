// AdSense Management API v2: Tageseinnahmen + offenes Guthaben ("unpaid").
import { googleConfigured } from '../google/oauth.js';
import { parseNumber } from '../csv.js';

export const meta = { id: 'adsense', label: 'AdSense', art: 'Web-Werbung', kind: 'earned',
  needs: ['ADSENSE_ACCOUNT_ID'], google: true,
  help: 'Braucht die Google-Verbindung oben. Nur eintragen, wenn du AdSense (Webseiten) nutzt.',
  fields: [{ key: 'ADSENSE_ACCOUNT_ID', label: 'Publisher-ID', hint: 'Form pub-1234567890123456' }] };

export function configured(cfg = {}) {
  return !!(cfg.ADSENSE_ACCOUNT_ID && googleConfigured());
}

export async function fetchData({ cfg = {}, google } = {}) {
  const googleFetch = google.fetch;
  const acc = String(cfg.ADSENSE_ACCOUNT_ID || '').replace(/^accounts\//, '');
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
