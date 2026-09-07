import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { loadJSON } from '../store.js';
import { getRates } from '../fx.js';
import { emptyHistory, baseOf } from '../collect.js';
import { buildSummary } from '../summary.js';
import { ukey } from '../users.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const u = req.user;
  const [history, latest] = await Promise.all([loadJSON(ukey(u.id, 'history')), loadJSON(ukey(u.id, 'latest'))]);
  let fx;
  try { fx = await getRates(baseOf(u)); } catch (e) { fx = { base: baseOf(u), date: null, rates: {}, error: e.message }; }
  const summary = buildSummary(history || emptyHistory(), fx, latest);
  if (fx.error) summary.fxError = fx.error;
  res.status(200).json(summary);
}));
