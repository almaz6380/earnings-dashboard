// Ein Sammellauf je Konto: alle eingerichteten Quellen abrufen, in den Verlauf mischen,
// Zusammenfassung speichern. Fehler einer Quelle blockieren die anderen nicht.
import { loadJSON, saveJSON } from './store.js';
import { getRates, normBase, round2 } from './fx.js';
import { SOURCES } from './sources/index.js';
import { buildSummary } from './summary.js';
import { ergaenzeIcons } from './icons.js';
import { sendDaily } from './notify.js';
import { getUser, listUserIds, ukey } from './users.js';
import { konfiguration, nutzbare, beschriftung } from './quellen.js';
import { googleFor } from './google/oauth.js';
import { revenuecatFor, konfiguriert as rcKonfiguriert } from './revenuecat/oauth.js';

export const emptyHistory = () => ({ daily: {}, payouts: {}, balances: {}, sources: {}, apps: {} });

export const baseOf = (u) => normBase(u?.settings?.baseCurrency);

// Mehrere Einträge einer Quelle (zwei AdMob-Konten, drei RevenueCat-Projekte)
// ergeben eine einzige Antwort: Listen werden aneinandergehängt, Zahlen in `extra`
// summiert, Hinweise gesammelt. Was einzeln fehlschlägt, blockiert den Rest nicht.
export function vereine(teile, fehler = []) {
  const alle = (f) => teile.flatMap((t) => t[f] || []);
  const extra = {};
  for (const feld of new Set(teile.flatMap((t) => Object.keys(t.extra || {})))) {
    const werte = teile.map((t) => t.extra?.[feld]).filter((v) => v != null);
    if (!werte.length) continue;
    if (werte.every((v) => typeof v === 'number')) extra[feld] = round2(werte.reduce((a, b) => a + b, 0));
    else if (werte.every((v) => Array.isArray(v))) extra[feld] = werte.flat();
    else extra[feld] = werte[0];
  }
  const waehrungen = new Set(teile.map((t) => t.currency).filter(Boolean));
  const hinweise = teile.map((t) => t.note).filter(Boolean);
  if (fehler.length) hinweise.unshift(`Nicht abrufbar: ${fehler.join(' | ')}`);
  if (teile.length > 1) hinweise.push(`${teile.length} Einträge zusammengerechnet.`);
  return {
    currency: waehrungen.size === 1 ? [...waehrungen][0] : null,
    asOf: teile.map((t) => t.asOf).filter(Boolean).sort().at(-1) || new Date().toISOString(),
    daily: alle('daily'),
    payouts: alle('payouts'),
    apps: alle('apps'),
    balance: null,
    balances: teile.flatMap((t) => t.balances || (t.balance ? [t.balance] : [])),
    extra,
    note: hinweise.join(' ') || null,
  };
}

// Einen einzelnen Eintrag abrufen. Getrennt, damit der Probeabruf beim Einrichten
// denselben Weg nimmt wie der Sammellauf.
export function zugaenge(u, src, eintrag) {
  return {
    eintrag,
    base: baseOf(u),
    google: src.meta.google ? googleFor(u.id, eintrag.google) : undefined,
    revenuecat: rcKonfiguriert() ? revenuecatFor(u.id) : undefined,
  };
}

export async function runCollect({ user, userId, notify = true } = {}) {
  const u = user || (await getUser(userId));
  if (!u) throw new Error('Konto nicht gefunden.');
  const started = Date.now();
  const cfg = konfiguration(u);
  const base = baseOf(u);
  const fx = await getRates(base);
  const hKey = ukey(u.id, 'history'), lKey = ukey(u.id, 'latest');
  const history = (await loadJSON(hKey)) || emptyHistory();
  const vorher = await loadJSON(lKey);
  history.daily ||= {}; history.payouts ||= {}; history.balances ||= {}; history.sources ||= {}; history.apps ||= {};
  const today = new Date().toISOString().slice(0, 10);
  const results = {};

  for (const src of SOURCES) {
    const id = src.meta.id;
    const s = (history.sources[id] ||= {});
    const liste = nutzbare(cfg, id);
    if (!liste.length) { results[id] = { status: 'unconfigured' }; s.status = 'unconfigured'; continue; }
    const t0 = Date.now();
    // Bei genau einem Eintrag darf die Quelle bereits geholte Tage überspringen.
    // Bei mehreren geht das nicht: die bekannten Tage stammen dann womöglich von
    // einem anderen Konto, und der zweite Eintrag würde sie stillschweigend auslassen.
    const einzeln = liste.length === 1;
    const knownDates = new Set(einzeln ? Object.keys(history.daily[id] || {}) : []);
    const knownMonths = new Set(einzeln ? Object.keys(history.payouts[id] || {}) : []);
    const teile = [], fehler = [];
    for (const [i, eintrag] of liste.entries()) {
      try {
        teile.push(await src.fetchData({ ...zugaenge(u, src, eintrag), knownDates, knownMonths }));
      } catch (e) {
        fehler.push(`${beschriftung(src, eintrag, i)}: ${e.message.slice(0, 200)}`);
      }
    }
    if (!teile.length) {
      const msg = fehler.join(' | ') || 'Abruf fehlgeschlagen.';
      Object.assign(s, { status: 'error', lastError: msg.slice(0, 400), lastTry: new Date().toISOString() });
      results[id] = { status: 'error', error: msg.slice(0, 400), ms: Date.now() - t0 };
      continue;
    }
    const data = vereine(teile, fehler);
    mergeSource(history, id, data, today);
    mergeApps(history, id, data, today);
    Object.assign(s, { status: 'ok', lastOk: new Date().toISOString(), lastError: null, asOf: data.asOf, note: data.note || null, extra: data.extra || {}, currency: data.currency });
    results[id] = { status: 'ok', ms: Date.now() - t0, days: data.daily?.length || 0, eintraege: teile.length, fehler: fehler.length || undefined };
  }

  // Icons erst nach allen Quellen: braucht die gesammelten Store-Kennungen.
  try { await ergaenzeIcons(history); } catch { /* ohne Icons ist der Lauf trotzdem gültig */ }

  pruneHistory(history);
  await saveJSON(hKey, history);
  const latest = { collectedAt: new Date().toISOString(), ms: Date.now() - started, fxDate: fx.date, results };
  // Tag und Ergebnis der letzten Meldung mitnehmen, sonst vergäße jeder Lauf, dass heute schon gemeldet wurde.
  if (vorher?.gemeldetAm) { latest.gemeldetAm = vorher.gemeldetAm; latest.notify = vorher.notify; }
  await saveJSON(lKey, latest);

  const summary = buildSummary(history, fx, latest);
  // Höchstens eine Meldung am Tag. Läuft der externe Viertelstunden-Cron ohne notify=0,
  // kämen sonst 96 Nachrichten täglich aufs Telefon.
  if (notify && !schonGemeldet(vorher, today)) {
    try { latest.notify = await sendDaily(summary, u.settings || {}); } catch (e) { latest.notify = { error: e.message }; }
    latest.gemeldetAm = today;
    await saveJSON(lKey, latest);
  }
  return { latest, summary };
}

export const schonGemeldet = (latest, tag) => latest?.gemeldetAm === tag;

// Cron: alle Konten, die am längsten nicht dran waren zuerst, bis das Zeitbudget aufgebraucht ist.
// Was nicht mehr passt, kommt beim nächsten Lauf dran (Vercel begrenzt die Laufzeit einer Funktion).
// Konten, die jünger als minAlterMs gesammelt wurden, bleiben liegen: beim externen Cron hat
// sie meist gerade die offene App geholt, und zwei Läufe gleichzeitig verlieren einander Daten.
export async function runCollectAll({ notify = true, budgetMs = 50_000, minAlterMs = 0, now = Date.now() } = {}) {
  const ids = await listUserIds();
  const konten = [];
  for (const id of ids) {
    const latest = await loadJSON(ukey(id, 'latest'));
    konten.push({ id, latest, last: latest?.collectedAt ? Date.parse(latest.collectedAt) : 0 });
  }
  konten.sort((a, b) => a.last - b.last);
  const out = { konten: konten.length, gelaufen: 0, fehler: 0, offen: 0, frisch: 0, ms: 0 };
  const heute = new Date(now).toISOString().slice(0, 10);
  for (const k of konten) {
    // Wer heute noch eine Meldung bekommt, läuft trotzdem, sonst fiele sie aus, nur weil
    // die App kurz vor dem Morgen-Cron gesammelt hat.
    const meldetNoch = notify && !schonGemeldet(k.latest, heute);
    if (now - k.last < minAlterMs && !meldetNoch) { out.frisch++; continue; }
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
