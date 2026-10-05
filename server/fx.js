// Wechselkurse (EZB via frankfurter.app), Tages-Cache je Basiswährung im Speicher.
import { loadJSON, saveJSON } from './store.js';

export const DEFAULT_BASE = () => (process.env.BASE_CURRENCY || 'EUR').toUpperCase();
// Was die EZB führt - andere Basiswährungen lehnt frankfurter.app ab.
export const BASES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'NZD', 'SGD', 'HKD', 'BRL', 'MXN', 'INR', 'KRW', 'TRY', 'ZAR'];

export function normBase(cur) {
  const c = String(cur || '').toUpperCase();
  return BASES.includes(c) ? c : DEFAULT_BASE();
}

// Kurse eines Tages aendern sich nicht mehr. Wer sie in diesem Prozess schon geholt
// hat, fragt den Speicher nicht erneut - das sparen die haeufigen Sammellaeufe der
// offenen App, deren Befehle im Kontingent des Speichers zaehlen. Der Schluessel
// enthaelt das Datum, es kann also nichts Altes hervorkommen.
const imKopf = new Map();

export async function getRates(base = DEFAULT_BASE(), dateStr = new Date().toISOString().slice(0, 10)) {
  const b = normBase(base);
  const key = b === 'EUR' ? `fx:${dateStr}` : `fx:${b}:${dateStr}`;
  if (imKopf.has(key)) return imKopf.get(key);
  const cached = await loadJSON(key);
  if (cached?.rates) { imKopf.set(key, cached); return cached; }
  const res = await fetch(`https://api.frankfurter.app/latest?from=${b}`);
  if (!res.ok) throw new Error(`Wechselkurse: ${res.status}`);
  const data = await res.json();
  const out = { base: b, date: data.date, rates: { ...data.rates, [b]: 1 } };
  await saveJSON(key, out);
  // Ein Worker-Isolat lebt Stunden; ohne diese Schranke sammelte sich je Tag und
  // Basiswährung ein Eintrag an. Vergessen kostet nur einen Lesevorgang.
  if (imKopf.size > 8) imKopf.clear();
  imKopf.set(key, out);
  return out;
}

// Betrag aus Währung `cur` in Basiswährung. Unbekannte Währung -> null (wird angezeigt, nicht summiert).
export function toBase(amount, cur, fx) {
  if (amount == null || Number.isNaN(+amount)) return null;
  const c = String(cur || '').toUpperCase();
  if (!c || c === fx.base) return round2(+amount);
  const r = fx.rates?.[c];
  if (!r) return null;
  return round2(+amount / r);
}

export function round2(x) {
  return Math.round(x * 100) / 100;
}
