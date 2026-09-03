// Aus Verlauf + Wechselkursen die Anzeige-Daten bauen: KPIs, Tages-/Monatsreihen, Auszahlungen, Kontostände.
import { toBase, round2 } from './fx.js';
import { SOURCES } from './sources/index.js';

const ADS = ['admob', 'adsense'];
const SUBS_ESTIMATE = 'revenuecat';
const STORES = ['appstore', 'play'];

export function buildSummary(history, fx, latest = null, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const meta = Object.fromEntries(SOURCES.map((s) => [s.meta.id, s.meta]));
  const unconverted = new Set();

  // Tages-EUR je Quelle
  const eurDaily = {};
  for (const [id, days] of Object.entries(history.daily || {})) {
    eurDaily[id] = {};
    for (const [date, byCur] of Object.entries(days)) {
      let sum = 0;
      for (const [cur, amt] of Object.entries(byCur)) {
        const v = toBase(amt, cur, fx);
        if (v == null) unconverted.add(cur); else sum += v;
      }
      eurDaily[id][date] = round2(sum);
    }
  }

  // Abo-Umsatz: RevenueCat-Tageswerte, sonst Store-Erlöse (Apple Sales + Play), damit nichts doppelt zählt.
  const hasRcDaily = Object.keys(eurDaily[SUBS_ESTIMATE] || {}).length > 0;
  const earnedIds = [...ADS, ...(hasRcDaily ? [SUBS_ESTIMATE] : STORES)].filter((id) => eurDaily[id]);

  const sumRange = (id, from, to) => round2(Object.entries(eurDaily[id] || {}).filter(([d]) => d >= from && d <= to).reduce((a, [, v]) => a + v, 0));
  const dstr = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const lm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthStart = lm.toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const ranges = { today: [today, today], yesterday: [dstr(1), dstr(1)], d7: [dstr(6), today], d30: [dstr(29), today], month: [monthStart, today], lastMonth: [lastMonthStart, lastMonthEnd] };

  const bySource = {};
  const lastBalanceDate = Object.keys(history.balances || {}).sort().at(-1);
  for (const id of Object.keys(meta)) {
    const st = history.sources?.[id] || {};
    const r = {};
    for (const [k, [a, b]] of Object.entries(ranges)) r[k] = sumRange(id, a, b);
    const balances = (lastBalanceDate && history.balances[lastBalanceDate]?.[id]) || [];
    const balEntries = balances.map((b) => {
      const eur = toBase(b.amount, b.currency, fx);
      if (eur == null) unconverted.add(b.currency);
      return { ...b, eur };
    });
    bySource[id] = {
      id, label: meta[id].label, art: meta[id].art, kind: meta[id].kind, google: !!meta[id].google,
      status: st.status || 'unconfigured', asOf: st.asOf || null, lastOk: st.lastOk || null, error: st.lastError || null,
      note: st.note || null, extra: st.extra || {}, currency: st.currency || null,
      countsInTotal: earnedIds.includes(id),
      ...r,
      balances: balEntries, balanceDate: balEntries.length ? lastBalanceDate : null,
      hasDaily: Object.keys(eurDaily[id] || {}).length > 0,
    };
  }

  const kpis = {};
  for (const k of Object.keys(ranges)) kpis[k] = round2(earnedIds.reduce((a, id) => a + bySource[id][k], 0));

  // Tagesreihe (90 Tage) und Monatsreihe (12 Monate) über alle Quellen mit Tageswerten
  const dailyIds = Object.keys(eurDaily).filter((id) => Object.keys(eurDaily[id]).length);
  const series = [];
  for (let i = 89; i >= 0; i--) {
    const date = dstr(i);
    const row = { date };
    let total = 0;
    for (const id of dailyIds) { row[id] = eurDaily[id][date] ?? 0; if (earnedIds.includes(id)) total += row[id]; }
    row.total = round2(total);
    series.push(row);
  }
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    const row = { month: m };
    let total = 0;
    for (const id of dailyIds) {
      row[id] = round2(Object.entries(eurDaily[id]).filter(([d]) => d.startsWith(m)).reduce((a, [, v]) => a + v, 0));
      if (earnedIds.includes(id)) total += row[id];
    }
    row.total = round2(total);
    monthly.push(row);
  }

  // Tatsächliche Auszahlungen (Play, Apple) je Monat
  const payouts = [];
  for (const [id, months] of Object.entries(history.payouts || {})) {
    for (const [month, byCur] of Object.entries(months)) {
      for (const [cur, amount] of Object.entries(byCur)) {
        const eur = toBase(amount, cur, fx);
        if (eur == null) unconverted.add(cur);
        payouts.push({ source: id, label: meta[id]?.label || id, month, amount, currency: cur, eur });
      }
    }
  }
  payouts.sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));

  const accountsEur = round2(['wise', 'paypal'].flatMap((id) => bySource[id].balances).filter((b) => b.eur != null).reduce((a, b) => a + b.eur, 0));
  const openEur = round2(['adsense'].flatMap((id) => bySource[id].balances).filter((b) => b.eur != null).reduce((a, b) => a + b.eur, 0));

  return {
    collectedAt: latest?.collectedAt || null,
    baseCurrency: fx.base,
    fxDate: fx.date,
    kpis,
    subsSource: hasRcDaily ? 'revenuecat' : 'stores',
    bySource,
    series,
    monthly,
    payouts,
    accountsEur,
    openEur,
    unconverted: [...unconverted],
    notify: latest?.notify || null,
  };
}
