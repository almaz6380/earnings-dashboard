import { teileState, exchangeCode } from '../revenuecat/oauth.js';
import { APP_SCHEME } from '../google/oauth.js';
import { getUser } from '../users.js';

export default async function handler(req, res) {
  const { code, state: roh, error } = req.query || {};
  const { nonce, state } = teileState(roh);
  const back = (q) => res.redirect(302, state?.native ? `${APP_SCHEME}://revenuecat?${new URLSearchParams(q)}` : `/?${new URLSearchParams(q)}#einrichten`);
  if (!state || !nonce) return back({ revenuecat: 'fehler', msg: 'Ungültiger oder abgelaufener Login-Status. Bitte erneut versuchen.' });
  if (error) return back({ revenuecat: 'fehler', msg: `RevenueCat: ${error}` });
  if (!(await getUser(state.u))) return back({ revenuecat: 'fehler', msg: 'Konto nicht gefunden.' });
  try {
    await exchangeCode(code, nonce, req, state.u);
    return back({ revenuecat: 'ok' });
  } catch (e) {
    return back({ revenuecat: 'fehler', msg: e.message.slice(0, 300) });
  }
}
