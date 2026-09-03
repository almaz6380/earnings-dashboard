// Tägliche Zusammenfassung per Telegram und/oder ntfy.sh (beides optional).
import { BASE } from './fx.js';

export function notifyConfigured() {
  return !!((process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) || process.env.NTFY_TOPIC);
}

const eur = (v) => `${(v ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${BASE() === 'EUR' ? '€' : BASE()}`;

export function formatDaily(summary) {
  const k = summary.kpis;
  const parts = Object.values(summary.bySource).filter((s) => s.countsInTotal && s.status === 'ok').map((s) => `${s.label} ${eur(s.yesterday)}`);
  const errors = Object.values(summary.bySource).filter((s) => s.status === 'error').map((s) => `${s.label}: ${s.error}`);
  const lines = [
    `Gestern: ${eur(k.yesterday)}${parts.length ? ` (${parts.join(', ')})` : ''}`,
    `7 Tage: ${eur(k.d7)} · 30 Tage: ${eur(k.d30)} · Monat: ${eur(k.month)}`,
  ];
  if (summary.openEur) lines.push(`Offen (AdSense): ${eur(summary.openEur)}`);
  if (summary.accountsEur) lines.push(`Konten (Wise/PayPal): ${eur(summary.accountsEur)}`);
  const lastPayout = summary.payouts[0];
  if (lastPayout) lines.push(`Letzte Auszahlung: ${lastPayout.label} ${lastPayout.month}: ${lastPayout.eur != null ? eur(lastPayout.eur) : `${lastPayout.amount} ${lastPayout.currency}`}`);
  if (errors.length) lines.push(`⚠️ ${errors.join(' | ')}`);
  return lines.join('\n');
}

export async function sendDaily(summary) {
  if (!notifyConfigured()) return { skipped: true };
  const text = formatDaily(summary);
  const out = {};
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: `📊 Einnahmen\n${text}` }),
    });
    out.telegram = res.ok ? 'ok' : `${res.status} ${(await res.text()).slice(0, 120)}`;
  }
  if (process.env.NTFY_TOPIC) {
    const res = await fetch(`https://ntfy.sh/${process.env.NTFY_TOPIC}`, {
      method: 'POST', headers: { Title: 'Einnahmen', Tags: 'bar_chart' }, body: text,
    });
    out.ntfy = res.ok ? 'ok' : `${res.status}`;
  }
  return out;
}
