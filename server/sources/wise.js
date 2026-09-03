// Wise: Kontostände je Währung (persönlicher API-Token, nur lesen).
import { getJSON } from '../http.js';

export const meta = { id: 'wise', label: 'Wise', art: 'Kontostand', kind: 'balance', needs: ['WISE_API_TOKEN', 'WISE_PROFILE_ID'] };

export function configured() {
  return !!(process.env.WISE_API_TOKEN && process.env.WISE_PROFILE_ID);
}

export async function fetchData() {
  const list = await getJSON(`https://api.wise.com/v4/profiles/${process.env.WISE_PROFILE_ID}/balances?types=STANDARD`, {
    headers: { authorization: `Bearer ${process.env.WISE_API_TOKEN}` },
  });
  const balances = (Array.isArray(list) ? list : []).map((b) => ({ amount: Number(b.amount?.value ?? 0), currency: b.amount?.currency || b.currency }));
  return { currency: balances[0]?.currency || null, asOf: new Date().toISOString(), daily: [], balance: null, balances, extra: {}, note: null };
}
