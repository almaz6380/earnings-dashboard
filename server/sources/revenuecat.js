// RevenueCat API v2: Übersichts-Kennzahlen (MRR, Umsatz 28 Tage, aktive Abos).
// Ein Eintrag ist ein Projekt. Der Zugang kommt entweder aus dem RevenueCat-Login
// (OAuth, gilt für alle Projekte des Kontos) oder aus einem Secret Key v2, der
// immer nur für genau ein Projekt gilt.
import { getJSON, ymd, daysAgo } from '../http.js';

export const meta = { id: 'revenuecat', label: 'RevenueCat', art: 'Abo-Umsatz (Schätzung)', kind: 'earned',
  needs: ['REVENUECAT_PROJECT_ID'], mehrfach: true, entdeckbar: true, loginMoeglich: true,
  entdeckenAb: ['REVENUECAT_API_KEY'],
  konsole: { url: 'https://app.revenuecat.com', text: 'RevenueCat öffnen' },
  help: 'Am einfachsten mit RevenueCat anmelden. Ohne Login je Projekt einen Secret Key v2 mit der Berechtigung „Charts & Metrics: Read" eintragen.',
  felder: [
    { key: 'REVENUECAT_API_KEY', label: 'Secret API Key v2', secret: true, optional: true, hint: 'nur nötig ohne RevenueCat-Login' },
    { key: 'REVENUECAT_PROJECT_ID', label: 'Projekt-ID', hint: 'steht in der Adresszeile: app.revenuecat.com/projects/<ID>' },
  ] };

// Ohne Projekt-ID geht nichts; der Zugang kommt vom Login oder vom Schlüssel.
export const vollstaendig = (e) => !!(e?.REVENUECAT_PROJECT_ID && (e.REVENUECAT_API_KEY || e.oauth));

async function kopf(eintrag, revenuecat) {
  if (eintrag.oauth) {
    if (!revenuecat) throw new Error('RevenueCat-Login ist auf diesem Server nicht eingerichtet.');
    return { authorization: `Bearer ${await revenuecat.token()}` };
  }
  return { authorization: `Bearer ${eintrag.REVENUECAT_API_KEY}` };
}

// Welche Projekte dieser Zugang sieht - erspart das Kopieren der ID aus der Adresszeile.
export async function entdecke({ eintrag = {}, revenuecat, fetchJSON = getJSON } = {}) {
  if (!eintrag.oauth && !eintrag.REVENUECAT_API_KEY) throw new Error('Erst anmelden oder einen Secret Key eintragen.');
  const r = await fetchJSON('https://api.revenuecat.com/v2/projects', { headers: await kopf(eintrag, revenuecat) });
  return (r.items || []).map((p) => ({
    werte: { REVENUECAT_PROJECT_ID: p.id },
    label: p.name || p.id,
    hinweis: p.name ? p.id : null,
  }));
}

const apiBase = (id) => `https://api.revenuecat.com/v2/projects/${id}`;

// Ein Projekt abrufen. Fehler wirft, der Aufrufer fängt ihn ab.
export async function fetchProject(p, { days = 60, fetchJSON = getJSON, base = 'EUR', headers } = {}) {
  const cur = base;
  const ov = await fetchJSON(`${apiBase(p.id)}/metrics/overview?currency=${cur}`, { headers });
  const metrics = {};
  for (const m of ov.metrics || ov.overview_metrics || []) metrics[m.id] = m.value;
  const currency = ov.currency || cur;

  let daily = [], note = null;
  try {
    const q = new URLSearchParams({ start_date: ymd(daysAgo(days)), end_date: ymd(new Date()), resolution: 'day', currency });
    daily = chartToDaily(await fetchJSON(`${apiBase(p.id)}/charts/revenue?${q}`, { headers }), currency);
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

// Ein Eintrag ist ein Projekt. Mehrere Einträge führt der Sammellauf zusammen.
export async function fetchData({ eintrag = {}, revenuecat, base = 'EUR', days = 60, fetchJSON = getJSON } = {}) {
  const headers = await kopf(eintrag, revenuecat);
  const p = { id: eintrag.REVENUECAT_PROJECT_ID, label: eintrag.label || eintrag.REVENUECAT_PROJECT_ID };
  const r = await fetchProject(p, { days, fetchJSON, base, headers });
  return mergeProjects([r], [], r.note ? [r.note] : []);
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
