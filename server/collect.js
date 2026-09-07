// Ein Sammellauf je Konto: alle eingerichteten Quellen abrufen, in den Verlauf mischen,
// Zusammenfassung speichern. Fehler einer Quelle blockieren die anderen nicht.
import { loadJSON, saveJSON } from './store.js';
import { getRates, normBase } from './fx.js';
import { SOURCES } from './sources/index.js';
import { buildSummary } from './summary.js';
import { ergaenzeIcons } from './icons.js';
import { sendDaily } from './notify.js';
import { getUser, getConfig, listUserIds, ukey } from './users.js';
import { googleFor } from './google/oauth.js';

export const emptyHistory = () => ({ daily: {}, payouts: {}, balances: {}, sources: {}, apps: {} });

export const baseOf = (u) => normBase(u?.settings?.baseCurrency);

export async function runCollect({ user, userId, notify = true } = {}) {
  const u = user || (await getUser(userId));
  if (!u) throw new Error('Konto nicht gefunden.');
  const started = Date.now();
  const cfg = getConfig(u);
  const base = baseOf(u);
  const google = googleFor(u.id);
  const fx = await getRates(base);
  const hKey = ukey(u.id, 'history'), lKey = ukey(u.id, 'latest');
  const history = (await loadJSON(hKey)) || emptyHistory();
  history.daily ||= {}; history.payouts ||= {}; history.balances ||= {}; history.sources ||= {}; history.apps ||= {};
  const today = new Date().toISOString().slice(0, 10);
  const results = {};

  for (const src of SOURCES) {
    const id = src.meta.id;
    const s = (history.sources[id] ||= {});
    if (!src.configured(cfg)) { results[id] = { status: 'unconfigured' }; s.status = 'unconfigured'; continue; }
    const t0 = Date.now();
    try {
      const knownDates = new Set(Object.keys(history.daily[id] || {}));
      const knownMonths = new Set(Object.keys(history.payouts[id] || {}));
      const data = await src.fetchData({ cfg, google, base, knownDates, knownMonths });
      mergeSource(history, id, data, today);
      mergeApps(history, id, data, today);
      Object.assign(s, { status: 'ok', lastOk: new Date().toISOString(), lastError: null, asOf: data.asOf, note: data.note || null, extra: data.extra || {}, currency: data.currency });
      results[id] = { status: 'ok', ms: Date.now() - t0, days: data.daily?.length || 0 };
    } catch (e) {
      Object.assign(s, { status: 'error', lastError: e.message.slice(0, 400), lastTry: new Date().toISOString() });
      results[id] = { status: 'error', error: e.message.slice(0, 400), ms: Date.now() - t0 };
    }
  }

  // Icons erst nach allen Quellen: braucht die gesammelten Store-Kennungen.
  try { await ergaenzeIcons(history); } catch { /* ohne Icons ist der Lauf trotzdem gültig */ }

  pruneHistory(history);
  await saveJSON(hKey, history);
  const latest = { collectedAt: new Date().toISOString(), ms: Date.now() - started, fxDate: fx.date, results };
  await saveJSON(lKey, latest);

  const summary = buildSummary(history, fx, latest);
  if (notify) {
    try { latest.notify = await sendDaily(summary, u.settings || {}); } catch (e) { latest.notify = { error: e.message }; }
    await saveJSON(lKey, latest);
  }
  return { latest, summary };
}

// Cron: alle Konten, die am längsten nicht dran waren zuerst, bis das Zeitbudget aufgebraucht ist.
// Was nicht mehr passt, kommt beim nächsten Lauf dran (Vercel begrenzt die Laufzeit einer Funktion).
export async function runCollectAll({ notify = true, budgetMs = 50_000, now = Date.now() } = {}) {
  const ids = await listUserIds();
  const konten = [];
  for (const id of ids) {
    const latest = await loadJSON(ukey(id, 'latest'));
    konten.push({ id, last: latest?.collectedAt ? Date.parse(latest.collectedAt) : 0 });
  }
  konten.sort((a, b) => a.last - b.last);
  const out = { konten: konten.length, gelaufen: 0, fehler: 0, offen: 0, ms: 0 };
  for (const k of konten) {
    if (Date.now() - now > budgetMs) { out.offen++; continue; }
    try { await runCollect({ userId: k.id, notify }); out.gelaufen++; }
    catch (e) { out.fehler++; console.error(`Sammellauf ${k.id}: ${e.message}`); }
  }
  out.ms = Date.now() - now;
  return out;
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

// Tageswerte je App und Quelle. Struktur: apps[quelle][appId] = { name, daily: { datum: { WÄHRUNG: betrag } } }
export function mergeApps(history, id, data, today) {
  if (!data.apps?.length) return;
  const proQuelle = (history.apps[id] ||= {});
  for (const row of data.apps) {
    if (!row?.date || typeof row.amount !== 'number' || !row.currency || !row.id) continue;
    const app = (proQuelle[row.id] ||= { name: row.name || row.id, daily: {} });
    if (row.name) app.name = row.name;
    // Store-Kennung merken, damit das Icon später gefunden werden kann.
    if (row.platform && row.storeId) { app.platform = row.platform; app.storeId = row.storeId; }
    const cur = row.currency.toUpperCase();
    // Wie bei mergeSource: ein neuer Abruf ersetzt den Tageswert, statt ihn zu verdoppeln.
    if (!app.daily[row.date] || app.daily[row.date].__fresh !== today) app.daily[row.date] = { __fresh: today };
    app.daily[row.date][cur] = Math.round(((app.daily[row.date][cur] || 0) + row.amount) * 100) / 100;
  }
  for (const app of Object.values(proQuelle)) for (const v of Object.values(app.daily)) delete v.__fresh;
}

// Verlauf begrenzen: Tageswerte 2 Jahre, Guthaben-Snapshots 1 Jahr.
export function pruneHistory(history, now = new Date()) {
  const cutDaily = new Date(now.getTime() - 730 * 86400000).toISOString().slice(0, 10);
  const cutBal = new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10);
  for (const d of Object.values(history.daily)) for (const k of Object.keys(d)) if (k < cutDaily) delete d[k];
  for (const quelle of Object.values(history.apps || {})) {
    for (const app of Object.values(quelle)) for (const k of Object.keys(app.daily)) if (k < cutDaily) delete app.daily[k];
  }
  for (const k of Object.keys(history.balances)) if (k < cutBal) delete history.balances[k];
}
