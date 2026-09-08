// PayPal: Kontostand (Reporting API, braucht "Transaction Search" in der PayPal-App).
import { getJSON } from '../http.js';

export const meta = { id: 'paypal', label: 'PayPal', art: 'Kontostand', kind: 'balance',
  needs: ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET'], mehrfach: true,
  konsole: { url: 'https://developer.paypal.com/dashboard/applications/live', text: 'PayPal-Entwicklerkonsole' },
  help: 'Apps & Credentials → Live → App anlegen, unter Features „Transaction Search" aktivieren.',
  felder: [
    { key: 'PAYPAL_CLIENT_ID', label: 'Client-ID' },
    { key: 'PAYPAL_CLIENT_SECRET', label: 'Secret', secret: true },
    { key: 'PAYPAL_ENV', label: 'Umgebung', optional: true, hint: 'live (Standard) oder sandbox' },
  ] };

export const vollstaendig = (e) => !!(e?.PAYPAL_CLIENT_ID && e?.PAYPAL_CLIENT_SECRET);

const host = (cfg) => (cfg.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com');

export async function fetchData({ eintrag: cfg = {} } = {}) {
  const basic = Buffer.from(`${cfg.PAYPAL_CLIENT_ID}:${cfg.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const tok = await getJSON(`${host(cfg)}/v1/oauth2/token`, {
    method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const res = await getJSON(`${host(cfg)}/v1/reporting/balances`, { headers: { authorization: `Bearer ${tok.access_token}` } });
  const balances = (res.balances || []).map((b) => ({ amount: Number(b.total_balance?.value ?? 0), currency: b.total_balance?.currency_code || b.currency }));
  return { currency: balances[0]?.currency || null, asOf: res.as_of_time || new Date().toISOString(), daily: [], balance: null, balances, extra: {}, note: null };
}
