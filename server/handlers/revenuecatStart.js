// RevenueCat-Login starten: im Browser mit Sitzung, aus der App mit Einmal-Ticket.
import { currentUser } from '../auth.js';
import { konfiguriert, authUrl, verifyTicket } from '../revenuecat/oauth.js';

export default async function handler(req, res) {
  if (!konfiguriert()) return res.status(500).send('Der RevenueCat-Login ist auf diesem Server nicht eingerichtet.');
  const ticket = req.query?.ticket ? verifyTicket(String(req.query.ticket)) : null;
  const u = ticket ? { id: ticket.u } : await currentUser(req);
  if (!u) return res.status(401).send('Nicht angemeldet.');
  res.redirect(302, await authUrl(u.id, req, { native: !!ticket }));
}
