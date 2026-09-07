import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { loadJSON } from '../store.js';
import { getRates } from '../fx.js';
import { emptyHistory } from '../collect.js';
import { buildSummary } from '../summary.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const [history, latest] = await Promise.all([loadJSON('history'), loadJSON('latest')]);
  let fx;
  try { fx = await getRates(); } catch (e) { fx = { base: process.env.BASE_CURRENCY || 'EUR', date: null, rates: {}, error: e.message }; }
  const summary = buildSummary(history || emptyHistory(), fx, latest);
  if (fx.error) summary.fxError = fx.error;
  res.status(200).json(summary);
}));
