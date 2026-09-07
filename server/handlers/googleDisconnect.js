import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { disconnect } from '../google/oauth.js';

export default withCors(requireAuth(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  await disconnect();
  res.status(200).json({ ok: true });
}));
