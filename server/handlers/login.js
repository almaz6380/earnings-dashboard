import { tryLogin, makeToken, cookieHeader, currentUser, isSecure } from '../auth.js';
import { withCors } from '../cors.js';
import { body, TTL_SEC } from './_body.js';

// Antwort nach erfolgreicher Anmeldung/Registrierung: Cookie für den Browser,
// Token im Body für die App (nur wenn angefragt - der Browser sieht das Token nicht).
export function sessionResponse(req, res, user, wantToken) {
  const token = makeToken(user);
  res.setHeader('set-cookie', cookieHeader(token, { maxAgeSec: TTL_SEC, secure: isSecure(req) }));
  const out = { angemeldet: true, email: user.email };
  if (wantToken === true) { out.token = token; out.gueltigSek = TTL_SEC; }
  return res.status(200).json(out);
}

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET') {
    const u = await currentUser(req);
    return res.status(200).json({ angemeldet: !!u, email: u?.email || null });
  }
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  const b = body(req);
  if (!b.email || !b.password) return res.status(400).json({ fehler: 'E-Mail und Passwort angeben.' });
  const r = await tryLogin(req, b.email, b.password);
  if (r.veraltet) {
    return res.status(401).json({ fehler: 'Dein Passwort muss nach dem Serverumzug einmal neu gesetzt werden. Bitte „Passwort vergessen“ nutzen.' });
  }
  if (!r.ok) {
    return res.status(401).json({ fehler: r.wartenSek ? `Zu viele Fehlversuche. Bitte ${Math.ceil(r.wartenSek / 60)} Min. warten.` : `E-Mail oder Passwort falsch.${r.verbleibend ? ` Noch ${r.verbleibend} Versuche.` : ''}` });
  }
  return sessionResponse(req, res, r.user, b.token);
});
