// RevenueCat API v2: Übersichts-Kennzahlen (MRR, Umsatz 28 Tage, aktive Abos).
// Mehrere Projekte möglich: RevenueCat-Secret-Keys gelten je Projekt, darum je Projekt
// ein Paar aus Schlüssel und Projekt-ID (REVENUECAT_API_KEY / _2 / _3 …).
import { getJSON, ymd, daysAgo } from '../http.js';
import { BASE } from '../fx.js';

export const meta = { id: 'revenuecat', label: 'RevenueCat', art: 'Abo-Umsatz (Schätzung)', kind: 'earned',
  needs: ['REVENUECAT_API_KEY', 'REVENUECAT_PROJECT_ID'] };

const MAX_PROJEKTE = 5;

// Liest die nummerierten Paare aus der Umgebung. Nummer 1 ohne Suffix.
export function projects(env = process.env) {
  const out = [];
  for (let i = 1; i <= MAX_PROJEKTE; i++) {
    const s = i === 1 ? '' : `_${i}`;
    const key = env[`REVENUECAT_API_KEY${s}`];
    const id = env[`REVENUECAT_PROJECT_ID${s}`];
    if (key && id) out.push({ key, id, label: env[`REVENUECAT_LABEL${s}`] || `Projekt ${i}` });
  }
  return out;
}

export function configured() {
  return projects().length > 0;
}

const base = (id) => `https://api.revenuecat.com/v2/projects/${id}`;

// Ein Projekt abrufen. Fehler wirft, der Aufrufer fängt ihn ab.
export async function fetchProject(p, { days = 60, fetchJSON = getJSON } = {}) {
  const cur = BASE();
  const headers = { authorization: `Bearer ${p.key}` };
  const ov = await fetchJSON(`${base(p.id)}/metrics/overview?currency=${cur}`, { headers });
  const metrics = {};
  for (const m of ov.metrics || ov.overview_metrics || []) metrics[m.id] = m.value;
  const currency = ov.currency || cur;

  let daily = [], note = null;
  try {
    const q = new URLSearchParams({ start_date: ymd(daysAgo(days)), end_date: ymd(new Date()), resolution: 'day', currency });
    daily = chartToDaily(await fetchJSON(`${base(p.id)}/charts/revenue?${q}`, { headers }), currency);
  } catch (e) {
    note = `${p.label}: Tagesverlauf nicht verfügbar (${e.message.slice(0, 80)}).`;
  }
  return {
    label: p.label,
    currency,
    daily,
    revenue28: num(metrics.revenue),
    mrr: num(metrics.mrr),
    activeSubscriptions: num(metrics.active_subscriptions),
    activeTrials: num(metrics.active_trials),
    note,
  };
}

export async function fetchData({ days = 60, fetchJSON = getJSON } = {}) {
  const liste = projects();
  if (!liste.length) throw new Error('Kein RevenueCat-Projekt eingerichtet.');
  const ergebnisse = [], fehler = [], hinweise = [];
  // Seriell, damit das Rate-Limit (25 Anfragen/Minute) nicht anschlägt.
  for (const p of liste) {
    try {
      const r = await fetchProject(p, { days, fetchJSON });
      ergebnisse.push(r);
      if (r.note) hinweise.push(r.note);
    } catch (e) {
      fehler.push(`${p.label}: ${e.message.slice(0, 150)}`);
    }
  }
  if (!ergebnisse.length) throw new Error(fehler.join(' | ') || 'RevenueCat lieferte keine Daten.');
  return mergeProjects(ergebnisse, fehler, hinweise);
}

// Ergebnisse mehrerer Projekte zusammenführen.
export function mergeProjects(ergebnisse, fehler = [], hinweise = []) {
  const daily = ergebnisse.flatMap((r) => r.daily);
  // Jedes Projekt zählt als eigene App, damit die Aufschlüsselung greift.
  const apps = ergebnisse.flatMap((r) => r.daily.map((d) => ({ id: r.label, name: r.label, ...d })));
  const currency = ergebnisse[0].currency;
  const gleicheWaehrung = ergebnisse.every((r) => r.currency === currency);

  // "Umsatz letzte 28 Tage" je Währung, damit nichts falsch summiert wird.
  const proWaehrung = {};
  for (const r of ergebnisse) {
    if (r.revenue28 == null) continue;
    proWaehrung[r.currency] = round2((proWaehrung[r.currency] || 0) + r.revenue28);
  }
  const balances = Object.entries(proWaehrung).map(([cur, amount]) => ({
    amount, currency: cur, label: 'Umsatz letzte 28 Tage',
  }));

  const summe = (feld) => {
    const werte = ergebnisse.map((r) => r[feld]).filter((v) => v != null);
    return werte.length ? round2(werte.reduce((a, v) => a + v, 0)) : null;
  };

  return {
    currency: gleicheWaehrung ? currency : null,
    asOf: new Date().toISOString(),
    daily,
    apps,
    balance: null,
    balances,
    extra: {
      mrr: summe('mrr'),
      activeSubscriptions: summe('activeSubscriptions'),
      activeTrials: summe('activeTrials'),
      projects: ergebnisse.map((r) => ({
        label: r.label, currency: r.currency, mrr: r.mrr,
        activeSubscriptions: r.activeSubscriptions, activeTrials: r.activeTrials, revenue28: r.revenue28,
      })),
    },
    note: [
      ergebnisse.length > 1 ? `${ergebnisse.length} Projekte zusammengerechnet.` : null,
      fehler.length ? `Nicht abrufbar: ${fehler.join(' | ')}` : null,
      ...hinweise,
    ].filter(Boolean).join(' ') || null,
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

const num = (v) => (v == null || Number.isNaN(+v) ? null : +v);
const round2 = (x) => Math.round(x * 100) / 100;
