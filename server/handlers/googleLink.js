// Für die App: Adresse, die sie im System-Browser öffnet, um ein Google-Konto zu verbinden.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { baseUrl, makeTicket, googleConfigured } from '../google/oauth.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (!googleConfigured()) return res.status(400).json({ fehler: 'Google-Login ist auf diesem Server nicht eingerichtet.' });
  res.status(200).json({ url: `${baseUrl(req)}/api/google/start?ticket=${encodeURIComponent(makeTicket(req.user.id))}` });
}));
