// Wechselkurse (EZB via frankfurter.app), Tages-Cache im Speicher. Basis = BASE_CURRENCY (EUR).
import { loadJSON, saveJSON } from './store.js';

export const BASE = () => (process.env.BASE_CURRENCY || 'EUR').toUpperCase();

export async function getRates(dateStr = new Date().toISOString().slice(0, 10)) {
  const key = `fx:${dateStr}`;
  const cached = await loadJSON(key);
  if (cached?.rates) return cached;
  const res = await fetch(`https://api.frankfurter.app/latest?from=${BASE()}`);
  if (!res.ok) throw new Error(`Wechselkurse: ${res.status}`);
  const data = await res.json();
  const out = { base: BASE(), date: data.date, rates: { ...data.rates, [BASE()]: 1 } };
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
