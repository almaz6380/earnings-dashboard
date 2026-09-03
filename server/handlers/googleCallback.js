import { isAuthed } from '../auth.js';
import { verifyState, exchangeCode } from '../google/oauth.js';

export default async function handler(req, res) {
  const back = (q) => res.redirect(302, `/?${new URLSearchParams(q)}#quellen`);
  if (!isAuthed(req)) return back({ google: 'fehler', msg: 'Sitzung abgelaufen – bitte erneut anmelden und verbinden.' });
  const { code, state, error } = req.query || {};
  if (error) return back({ google: 'fehler', msg: `Google: ${error}` });
  if (!verifyState(state)) return back({ google: 'fehler', msg: 'Ungültiger oder abgelaufener Login-Status. Bitte erneut versuchen.' });
  try {
    const { email } = await exchangeCode(code, req);
    return back({ google: 'ok', email: email || '' });
  } catch (e) {
    return back({ google: 'fehler', msg: e.message.slice(0, 300) });
  }
}
