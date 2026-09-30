// Sammellauf: per Cron (Secret) für alle Konten, oder angemeldet für das eigene Konto.
import { cronOk, currentUser } from '../auth.js';
import { withCors } from '../cors.js';
import { runCollect, runCollectAll } from '../collect.js';

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  // Im Cloudflare Worker gesetzt (wrangler.toml): nur die Quellen, die in 10 ms CPU passen.
  const nurLeicht = process.env.SAMMELN_NUR_LEICHT === '1';
  try {
    if (cronOk(req)) {
      // Benachrichtigung nur beim Cron-Lauf, nicht bei jedem Klick im Dashboard
      const out = await runCollectAll({
        notify: req.query?.notify !== '0',
        budgetMs: +(process.env.COLLECT_BUDGET_MS || 50_000),
        minAlterMs: +(process.env.COLLECT_MIN_ALTER_MS || 30_000),
        nurLeicht,
      });
      return res.status(200).json(out);
    }
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
    const { latest } = await runCollect({ user: u, notify: false, nurLeicht });
    res.status(200).json(latest);
  } catch (e) {
    res.status(500).json({ fehler: e.message });
  }
});
