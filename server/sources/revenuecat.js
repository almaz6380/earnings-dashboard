// RevenueCat API v2: Übersichts-Kennzahlen (MRR, Umsatz 28 Tage, aktive Abos).
// Tagesverlauf über den Chart-Endpunkt, falls der Key das darf – sonst nur Übersicht.
import { getJSON, ymd, daysAgo } from '../http.js';
import { BASE } from '../fx.js';

export const meta = { id: 'revenuecat', label: 'RevenueCat', art: 'Abo-Umsatz (Schätzung)', kind: 'earned',
  needs: ['REVENUECAT_API_KEY', 'REVENUECAT_PROJECT_ID'] };

export function configured() {
  return !!(process.env.REVENUECAT_API_KEY && process.env.REVENUECAT_PROJECT_ID);
}

const headers = () => ({ authorization: `Bearer ${process.env.REVENUECAT_API_KEY}` });
const base = () => `https://api.revenuecat.com/v2/projects/${process.env.REVENUECAT_PROJECT_ID}`;

export async function fetchData({ days = 60 } = {}) {
  const cur = BASE();
  const ov = await getJSON(`${base()}/metrics/overview?currency=${cur}`, { headers: headers() });
  const metrics = {};
  for (const m of ov.metrics || ov.overview_metrics || []) metrics[m.id] = { value: m.value, name: m.name, unit: m.unit, period: m.period };
  const currency = ov.currency || cur;

  let daily = [], note = null;
  try {
    const q = new URLSearchParams({ start_date: ymd(daysAgo(days)), end_date: ymd(new Date()), resolution: 'day', currency });
    const chart = await getJSON(`${base()}/charts/revenue?${q}`, { headers: headers() });
    daily = chartToDaily(chart, currency);
  } catch (e) {
    note = `Tagesverlauf nicht verfügbar (${e.message.slice(0, 80)}). Es zählen nur die Übersichtswerte.`;
  }
  const rev28 = metrics.revenue?.value ?? null;
  return {
    currency,
    asOf: new Date().toISOString(),
    daily,
    balance: rev28 != null ? { amount: +rev28, currency, label: 'Umsatz letzte 28 Tage' } : null,
    extra: {
      mrr: metrics.mrr?.value ?? null,
      activeSubscriptions: metrics.active_subscriptions?.value ?? null,
      activeTrials: metrics.active_trials?.value ?? null,
      newCustomers: metrics.new_customers?.value ?? null,
    },
    note,
  };
}

// Chart-Antwort defensiv lesen: erste Serie, Werte je Datum.
export function chartToDaily(chart, currency) {
  const out = [];
  const series = chart?.values || chart?.series?.[0]?.values || chart?.data?.[0]?.values || chart?.data || [];
  const dates = chart?.dates || chart?.x_values || chart?.series?.[0]?.dates || [];
  if (Array.isArray(series)) {
    series.forEach((v, i) => {
      const date = v?.date || v?.x || v?.timestamp || dates[i];
      const amount = typeof v === 'number' ? v : v?.value ?? v?.y ?? v?.[1];
      if (date != null && typeof amount === 'number') out.push({ date: normDate(date), amount, currency });
    });
  }
  return out.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
}

function normDate(d) {
  if (typeof d === 'number') return new Date(d < 1e12 ? d * 1000 : d).toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
