// Wechselkurse (EZB via frankfurter.app), Tages-Cache je Basiswährung im Speicher.
import { loadJSON, saveJSON } from './store.js';

export const DEFAULT_BASE = () => (process.env.BASE_CURRENCY || 'EUR').toUpperCase();
// Was die EZB führt - andere Basiswährungen lehnt frankfurter.app ab.
export const BASES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'NZD', 'SGD', 'HKD', 'BRL', 'MXN', 'INR', 'KRW', 'TRY', 'ZAR'];

export function normBase(cur) {
  const c = String(cur || '').toUpperCase();
  return BASES.includes(c) ? c : DEFAULT_BASE();
}

export async function getRates(base = DEFAULT_BASE(), dateStr = new Date().toISOString().slice(0, 10)) {
  const b = normBase(base);
  const key = b === 'EUR' ? `fx:${dateStr}` : `fx:${b}:${dateStr}`;
  const cached = await loadJSON(key);
  if (cached?.rates) return cached;
  const res = await fetch(`https://api.frankfurter.app/latest?from=${b}`);
  if (!res.ok) throw new Error(`Wechselkurse: ${res.status}`);
  const data = await res.json();
  const out = { base: b, date: data.date, rates: { ...data.rates, [b]: 1 } };
  await saveJSON(key, out);
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
