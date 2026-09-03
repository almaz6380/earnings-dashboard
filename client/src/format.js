export const SOURCE_COLORS = {
  admob: '#3987e5',
  adsense: '#d95926',
  revenuecat: '#199e70',
  appstore: '#c98500',
  play: '#d55181',
};
export const SOURCE_ORDER = ['admob', 'adsense', 'revenuecat', 'appstore', 'play', 'wise', 'paypal'];

export function fmtMoney(v, cur = 'EUR', digits = 2) {
  if (v == null || Number.isNaN(v)) return '–';
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${cur}`;
  }
}

export function fmtDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDay(ymd) {
  if (!ymd) return '–';
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}

export function fmtMonth(ym) {
  if (!ym) return '–';
  const [y, m] = ym.split('-');
  return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleString('de-DE', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
