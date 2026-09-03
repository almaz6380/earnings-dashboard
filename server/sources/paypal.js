// PayPal: Kontostand (Reporting API, braucht "Transaction Search" in der PayPal-App).
import { getJSON } from '../http.js';

export const meta = { id: 'paypal', label: 'PayPal', art: 'Kontostand', kind: 'balance', needs: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'] };

export function configured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

const host = () => (process.env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

export async function fetchData() {
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const tok = await getJSON(`${host()}/v1/oauth2/token`, {
    method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const res = await getJSON(`${host()}/v1/reporting/balances`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  const balances = (res.balances || []).map((b) => ({ amount: Number(b.total_balance?.value ?? 0), currency: b.total_balance?.currency_code || b.currency }));
  return { currency: balances[0]?.currency || null, asOf: res.as_of_time || new Date().toISOString(), daily: [], balance: null, balances, extra: {}, note: null };
}
