// Wise: Kontostände je Währung (persönlicher API-Token, nur lesen).
import { getJSON } from '../http.js';

export const meta = { id: 'wise', label: 'Wise', art: 'Kontostand', kind: 'balance', needs: ['WISE_API_TOKEN', 'WISE_PROFILE_ID'],
  help: 'Wise → Einstellungen → API-Token, Typ „Read only". Die Profil-ID liefert GET https://api.wise.com/v2/profiles mit dem Token.',
  fields: [
    { key: 'WISE_API_TOKEN', label: 'API-Token (nur lesen)', secret: true },
    { key: 'WISE_PROFILE_ID', label: 'Profil-ID' },
  ] };

export function configured(cfg = {}) {
  return !!(cfg.WISE_API_TOKEN && cfg.WISE_PROFILE_ID);
}

export async function fetchData({ cfg = {} } = {}) {
  const list = await getJSON(`https://api.wise.com/v4/profiles/${encodeURIComponent(cfg.WISE_PROFILE_ID)}/balances?types=STANDARD`, {
    headers: { authorization: `Bearer ${cfg.WISE_API_TOKEN}` },
  });
  const balances = (Array.isArray(list) ? list : []).map((b) => ({ amount: Number(b.amount?.value ?? 0), currency: b.amount?.currency || b.currency }));
  return { currency: balances[0]?.currency || null, asOf: new Date().toISOString(), daily: [], balance: null, balances, extra: {}, note: null };
}
