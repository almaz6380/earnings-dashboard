import { verifyState, exchangeCode, APP_SCHEME } from '../google/oauth.js';
import { getUser } from '../users.js';

export default async function handler(req, res) {
  const { code, state: rawState, error } = req.query || {};
  const st = verifyState(rawState);
  // Zurück in die App (URL-Schema) oder ins Web-Dashboard.
  const back = (q) => res.redirect(302, st?.native ? `${APP_SCHEME}://google?${new URLSearchParams(q)}` : `/?${new URLSearchParams(q)}#einrichten`);
  if (!st) return back({ google: 'fehler', msg: 'Ungültiger oder abgelaufener Login-Status. Bitte erneut versuchen.' });
  if (error) return back({ google: 'fehler', msg: `Google: ${error}` });
  if (!(await getUser(st.u))) return back({ google: 'fehler', msg: 'Konto nicht gefunden.' });
  try {
    const { email, neu } = await exchangeCode(code, req, st.u);
    return back({ google: 'ok', email: email || '', neu: neu ? '1' : '0' });
  } catch (e) {
    return back({ google: 'fehler', msg: e.message.slice(0, 300) });
  }
}
