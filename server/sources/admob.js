// AdMob API: Netzwerk-Bericht, geschätzte Einnahmen pro Tag (Micros).
import { googleFetch } from '../google/oauth.js';
import { daysAgo } from '../http.js';

export const meta = { id: 'admob', label: 'AdMob', art: 'Werbeeinnahmen (Schätzung)', kind: 'earned',
  needs: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMOB_PUBLISHER_ID'], google: true };

export function configured() {
  return !!(process.env.ADMOB_PUBLISHER_ID && process.env.GOOGLE_CLIENT_ID);
}

const dateObj = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });

export async function fetchData({ days = 60 } = {}) {
  const pub = process.env.ADMOB_PUBLISHER_ID.replace(/^accounts\//, '');
  const body = {
    reportSpec: {
      dateRange: { startDate: dateObj(daysAgo(days)), endDate: dateObj(new Date()) },
      dimensions: ['DATE'],
      metrics: ['ESTIMATED_EARNINGS'],
      sortConditions: [{ dimension: 'DATE', order: 'ASCENDING' }],
    },
  };
  const res = await googleFetch(`https://admob.googleapis.com/v1/accounts/${pub}/networkReport:generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return parseReport(res);
}

export function parseReport(res) {
  const parts = Array.isArray(res) ? res : [res];
  const header = parts.find((p) => p.header)?.header || {};
  const currency = header.localizationSettings?.currencyCode || 'USD';
  const daily = [];
  for (const p of parts) {
    const row = p.row;
    if (!row) continue;
    const d = row.dimensionValues?.DATE?.value || '';
    const micros = Number(row.metricValues?.ESTIMATED_EARNINGS?.microsValue ?? 0);
    if (/^\d{8}$/.test(d)) daily.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, amount: micros / 1e6, currency });
  }
  return { currency, asOf: new Date().toISOString(), daily, balance: null, extra: {}, note: 'AdMob meldet mit 1–2 Tagen Verzug; Guthaben = Summe seit letzter Auszahlung.' };
}
