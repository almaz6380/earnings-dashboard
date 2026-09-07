// Google-Login starten: im Browser mit Sitzung, aus der App mit Einmal-Ticket (?ticket=).
import { currentUser } from '../auth.js';
import { googleConfigured, authUrl, makeState, verifyTicket } from '../google/oauth.js';

export default async function handler(req, res) {
  if (!googleConfigured()) return res.status(500).send('Google-Login ist auf diesem Server nicht eingerichtet.');
  const ticket = req.query?.ticket ? verifyTicket(String(req.query.ticket)) : null;
  const u = ticket ? { id: ticket.u } : await currentUser(req);
  if (!u) return res.status(401).send('Nicht angemeldet. Bitte in der App unter „Einrichten" auf „Google verbinden" tippen.');
  res.redirect(302, authUrl(makeState(u.id, { native: !!ticket }), req));
}
