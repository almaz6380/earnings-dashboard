// Aus Verlauf + Wechselkursen die Anzeige-Daten bauen: KPIs, Tages-/Monatsreihen, Auszahlungen, Kontostände.
import { toBase, round2 } from './fx.js';
import { SOURCES } from './sources/index.js';

const ADS = ['admob', 'adsense'];
const SUBS_ESTIMATE = 'revenuecat';
const STORES = ['appstore', 'play'];

// Namen gleicher Apps aus verschiedenen Quellen zusammenführen: Klein schreiben, alles außer Buchstaben/Ziffern weg.
export const appKey = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

export function buildSummary(history, fx, latest = null, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const meta = Object.fromEntries(SOURCES.map((s) => [s.meta.id, s.meta]));
  const dstr = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + '-01';
  const lm = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonthStart = lm.toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const ranges = { today: [today, today], yesterday: [dstr(1), dstr(1)], d7: [dstr(6), today], d30: [dstr(29), today], month: [monthStart, today], lastMonth: [lastMonthStart, lastMonthEnd] };

  // Währungen, die die Kursquelle nicht führt (z. B. VND). Beträge mitzählen, damit
  // sichtbar wird, um wie viel Geld es überhaupt geht - sonst sieht es aus wie null.
  const unconverted = new Map();
  const nichtUmgerechnet = (cur, amount, date) => {
    const c = String(cur || '').toUpperCase();
    if (!c) return;
    const e = unconverted.get(c) || { currency: c, d30: 0, gesamt: 0 };
    const a = Number(amount) || 0;
    e.gesamt = round2(e.gesamt + a);
    if (date && date >= ranges.d30[0] && date <= ranges.d30[1]) e.d30 = round2(e.d30 + a);
    unconverted.set(c, e);
  };

  // Tages-EUR je Quelle
  const eurDaily = {};
  for (const [id, days] of Object.entries(history.daily || {})) {
    eurDaily[id] = {};
    for (const [date, byCur] of Object.entries(days)) {
      let sum = 0;
      for (const [cur, amt] of Object.entries(byCur)) {
        const v = toBase(amt, cur, fx);
        if (v == null) nichtUmgerechnet(cur, amt, date); else sum += v;
      }
      eurDaily[id][date] = round2(sum);
    }
  }

  // Abo-Umsatz: RevenueCat-Tageswerte, sonst Store-Erlöse (Apple Sales + Play), damit nichts doppelt zählt.
  const hasRcDaily = Object.keys(eurDaily[SUBS_ESTIMATE] || {}).length > 0;
  const earnedIds = [...ADS, ...(hasRcDaily ? [SUBS_ESTIMATE] : STORES)].filter((id) => eurDaily[id]);

  const sumRange = (id, from, to) => round2(Object.entries(eurDaily[id] || {}).filter(([d]) => d >= from && d <= to).reduce((a, [, v]) => a + v, 0));

  // Ein gemeldeter Null-Tag hat einen Eintrag, ein nicht gemeldeter Tag gar keinen.
  // Daraus lässt sich ablesen, bis wann eine Quelle überhaupt geliefert hat -
  // sonst ist "0,00 €" nicht von "noch keine Meldung" zu unterscheiden.
  const letzterGemeldeter = (id) => Object.keys(history.daily?.[id] || {}).filter((d) => d <= today).sort().at(-1) || null;

  const bySource = {};
  const lastBalanceDate = Object.keys(history.balances || {}).sort().at(-1);
  for (const id of Object.keys(meta)) {
    const st = history.sources?.[id] || {};
    const r = {};
    for (const [k, [a, b]] of Object.entries(ranges)) r[k] = sumRange(id, a, b);
    const balances = (lastBalanceDate && history.balances[lastBalanceDate]?.[id]) || [];
    const balEntries = balances.map((b) => {
      const eur = toBase(b.amount, b.currency, fx);
      if (eur == null) nichtUmgerechnet(b.currency, b.amount, null);
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
      lastDayDate: letzterGemeldeter(id),
      lastDay: eurDaily[id]?.[letzterGemeldeter(id)] ?? null,
    };
  }

  const kpis = {};
  for (const k of Object.keys(ranges)) kpis[k] = round2(earnedIds.reduce((a, id) => a + bySource[id][k], 0));
  // Jüngster Tag, den überhaupt eine zählende Quelle gemeldet hat, plus dessen Summe.
  const lastDayDate = earnedIds.map((id) => bySource[id].lastDayDate).filter(Boolean).sort().at(-1) || null;
  kpis.lastDay = lastDayDate
    ? round2(earnedIds.reduce((a, id) => a + (eurDaily[id]?.[lastDayDate] ?? 0), 0))
    : null;
  // Nicht jede Quelle ist gleich schnell. Wer an diesem Tag nichts gemeldet hat,
  // steuert 0 bei - das muss die Anzeige sagen, sonst wirkt die Summe vollständig.
  const mitTageswerten = earnedIds.filter((id) => bySource[id].hasDaily);
  const lastDaySources = mitTageswerten.filter((id) => eurDaily[id]?.[lastDayDate] != null).map((id) => meta[id].label);
  const lastDayFehlend = mitTageswerten.filter((id) => eurDaily[id]?.[lastDayDate] == null).map((id) => meta[id].label);

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
        if (eur == null) nichtUmgerechnet(cur, amount, null);
        payouts.push({ source: id, label: meta[id]?.label || id, month, amount, currency: cur, eur });
      }
    }
  }
  payouts.sort((a, b) => b.month.localeCompare(a.month) || a.source.localeCompare(b.source));


  // Aufschlüsselung nach Apps: nur Quellen, die auch in die Gesamtsumme zählen (sonst doppelt).
  const appsByKey = new Map();
  for (const [id, proQuelle] of Object.entries(history.apps || {})) {
    if (!earnedIds.includes(id)) continue;
    for (const [appId, app] of Object.entries(proQuelle || {})) {
      const name = (app?.name || appId).trim();
      const key = appKey(name);
      if (!key) continue;
      let eintrag = appsByKey.get(key);
      if (!eintrag) {
        eintrag = { key, name, icon: null, sources: {}, __daily: {} };
        appsByKey.set(key, eintrag);
      }
      if (name.length > eintrag.name.length) eintrag.name = name;
      // Dieselbe App kann aus mehreren Quellen kommen; das erste gefundene Icon genügt.
      if (!eintrag.icon && app?.icon) eintrag.icon = app.icon;
      const proSrc = (eintrag.sources[id] ||= { id, label: meta[id]?.label || id, __daily: {} });
      for (const [date, byCur] of Object.entries(app?.daily || {})) {
        let sum = 0;
        for (const [cur, amt] of Object.entries(byCur)) {
          const v = toBase(amt, cur, fx);
          if (v == null) { if (!unconverted.has(String(cur).toUpperCase())) nichtUmgerechnet(cur, 0, null); } else sum += v;
        }
        eintrag.__daily[date] = round2((eintrag.__daily[date] || 0) + sum);
        proSrc.__daily[date] = round2((proSrc.__daily[date] || 0) + sum);
      }
    }
  }
  // Je App und je Quelle dieselben Zeiträume, damit die Anzeige zwischen 7 Tagen,
  // 30 Tagen und Monat umschalten kann, ohne dass die Quellenzeile stehen bleibt.
  const zeitraeume = (daily) => {
    const werte = {};
    for (const [k, [von, bis]] of Object.entries(ranges)) {
      werte[k] = round2(Object.entries(daily).filter(([d]) => d >= von && d <= bis).reduce((s, [, v]) => s + v, 0));
    }
    return werte;
  };
  const apps = [...appsByKey.values()].map((a) => ({
    key: a.key, name: a.name, icon: a.icon || null, ...zeitraeume(a.__daily),
    sources: Object.values(a.sources)
      .map(({ id, label, __daily }) => ({ id, label, ...zeitraeume(__daily) }))
      .sort((x, y) => y.d30 - x.d30),
  })).sort((a, b) => b.d30 - a.d30 || b.month - a.month || a.name.localeCompare(b.name));

  const accountsEur = round2(['wise', 'paypal'].flatMap((id) => bySource[id].balances).filter((b) => b.eur != null).reduce((a, b) => a + b.eur, 0));
  const openEur = round2(['adsense'].flatMap((id) => bySource[id].balances).filter((b) => b.eur != null).reduce((a, b) => a + b.eur, 0));

  return {
    collectedAt: latest?.collectedAt || null,
    baseCurrency: fx.base,
    fxDate: fx.date,
    kpis,
    subsSource: hasRcDaily ? 'revenuecat' : 'stores',
    lastDayDate,
    lastDaySources,
    lastDayFehlend,
    bySource,
    apps,
    series,
    monthly,
    payouts,
    accountsEur,
    openEur,
    // Nur melden, wo tatsächlich Geld fehlt. Eine Währung mit 0 (etwa Gratis-Downloads
    // in Vietnam) als Warnung anzuzeigen, behauptet eine Lücke, die es nicht gibt.
    unconverted: [...unconverted.values()].filter((u) => u.gesamt !== 0 || u.d30 !== 0).sort((a, b) => b.gesamt - a.gesamt),
    notify: latest?.notify || null,
  };
}
