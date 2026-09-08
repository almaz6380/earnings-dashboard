import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { baseUrl } from '../google/oauth.js';
import { konfiguriert, makeTicket } from '../revenuecat/oauth.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (!konfiguriert()) return res.status(400).json({ fehler: 'Der RevenueCat-Login ist auf diesem Server nicht eingerichtet.' });
  res.status(200).json({ url: `${baseUrl(req)}/api/revenuecat/start?ticket=${encodeURIComponent(makeTicket(req.user.id))}` });
}));
