// Tägliche Zusammenfassung je Konto per Telegram (Bot des Betreibers, Chat-ID des Nutzers)
// und/oder ntfy.sh (Topic des Nutzers). Beides optional.
export function notifyConfigured(settings = {}) {
  if (settings.notify === false) return false;
  return !!((process.env.TELEGRAM_BOT_TOKEN && settings.telegramChatId) || settings.ntfyTopic);
}

// Telegram-Bot-Name für die Anleitung in der App (ohne @).
export const telegramBot = () => process.env.TELEGRAM_BOT_NAME || null;

const geld = (v, cur) => `${(v ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === 'EUR' ? '€' : cur}`;

export function formatDaily(summary) {
  const cur = summary.baseCurrency || 'EUR';
  const eur = (v) => geld(v, cur);
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

export async function sendDaily(summary, settings = {}) {
  if (!notifyConfigured(settings)) return { skipped: true };
  const text = formatDaily(summary);
  const out = {};
  if (process.env.TELEGRAM_BOT_TOKEN && settings.telegramChatId) {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: settings.telegramChatId, text: `📊 Einnahmen\n${text}` }),
    });
    out.telegram = res.ok ? 'ok' : `${res.status} ${(await res.text()).slice(0, 120)}`;
  }
  if (settings.ntfyTopic) {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(settings.ntfyTopic)}`, {
      method: 'POST', headers: { Title: 'Einnahmen', Tags: 'bar_chart' }, body: text,
    });
    out.ntfy = res.ok ? 'ok' : `${res.status}`;
  }
  return out;
}
