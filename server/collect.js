// Ein Sammellauf: alle konfigurierten Quellen abrufen, in den Verlauf mischen, Zusammenfassung speichern.
// Fehler einer Quelle blockieren die anderen nicht.
import { loadJSON, saveJSON } from './store.js';
import { getRates } from './fx.js';
import { SOURCES } from './sources/index.js';
import { buildSummary } from './summary.js';
import { sendDaily } from './notify.js';

export const emptyHistory = () => ({ daily: {}, payouts: {}, balances: {}, sources: {} });

export async function runCollect({ notify = true } = {}) {
  const started = Date.now();
  const fx = await getRates();
  const history = (await loadJSON('history')) || emptyHistory();
  history.daily ||= {}; history.payouts ||= {}; history.balances ||= {}; history.sources ||= {};
  const today = new Date().toISOString().slice(0, 10);
  const results = {};

  for (const src of SOURCES) {
    const id = src.meta.id;
    const s = (history.sources[id] ||= {});
    if (!src.configured()) { results[id] = { status: 'unconfigured' }; s.status = 'unconfigured'; continue; }
    const t0 = Date.now();
    try {
      const knownDates = new Set(Object.keys(history.daily[id] || {}));
      const knownMonths = new Set(Object.keys(history.payouts[id] || {}));
      const data = await src.fetchData({ knownDates, knownMonths });
      mergeSource(history, id, data, today);
      Object.assign(s, { status: 'ok', lastOk: new Date().toISOString(), lastError: null, asOf: data.asOf, note: data.note || null, extra: data.extra || {}, currency: data.currency });
      results[id] = { status: 'ok', ms: Date.now() - t0, days: data.daily?.length || 0 };
    } catch (e) {
      Object.assign(s, { status: 'error', lastError: e.message.slice(0, 400), lastTry: new Date().toISOString() });
      results[id] = { status: 'error', error: e.message.slice(0, 400), ms: Date.now() - t0 };
    }
  }

  pruneHistory(history);
  await saveJSON('history', history);
  const latest = { collectedAt: new Date().toISOString(), ms: Date.now() - started, fxDate: fx.date, results };
  await saveJSON('latest', latest);

  const summary = buildSummary(history, fx, latest);
  if (notify) {
    try { latest.notify = await sendDaily(summary); } catch (e) { latest.notify = { error: e.message }; }
    await saveJSON('latest', latest);
  }
  return { latest, summary };
}

export function mergeSource(history, id, data, today) {
  const d = (history.daily[id] ||= {});
  for (const row of data.daily || []) {
    if (!row?.date || typeof row.amount !== 'number' || !row.currency) continue;
    const cur = row.currency.toUpperCase();
    // Bei mehreren Zeilen gleicher Währung am selben Tag (z. B. Play-Transaktionen) summieren,
    // aber ein neuer Abruf ersetzt den alten Tageswert.
    if (!d[row.date] || d[row.date].__fresh !== today) d[row.date] = { __fresh: today };
    d[row.date][cur] = Math.round(((d[row.date][cur] || 0) + row.amount) * 100) / 100;
  }
  for (const v of Object.values(d)) delete v.__fresh;
  const p = (history.payouts[id] ||= {});
  for (const po of data.payouts || []) {
    if (!po?.month || typeof po.amount !== 'number' || !po.currency) continue;
    (p[po.month] ||= {})[po.currency.toUpperCase()] = po.amount;
  }
  const list = data.balances || (data.balance ? [data.balance] : []);
  if (list.length) {
    (history.balances[today] ||= {})[id] = list.map((b) => ({ amount: b.amount, currency: (b.currency || '').toUpperCase(), label: b.label || null }));
  }
}

// Verlauf begrenzen: Tageswerte 2 Jahre, Guthaben-Snapshots 1 Jahr.
export function pruneHistory(history, now = new Date()) {
  const cutDaily = new Date(now.getTime() - 730 * 86400000).toISOString().slice(0, 10);
  const cutBal = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  for (const d of Object.values(history.daily)) for (const k of Object.keys(d)) if (k < cutDaily) delete d[k];
  for (const k of Object.keys(history.balances)) if (k < cutBal) delete history.balances[k];
}
