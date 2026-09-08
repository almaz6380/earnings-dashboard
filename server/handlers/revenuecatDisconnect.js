import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { trennen } from '../revenuecat/oauth.js';

export default withCors(requireAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  await trennen(req.user.id);
  res.status(200).json({ ok: true });
}));
