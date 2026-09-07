// Konfigurationsstand des Kontos: welche Quellen eingerichtet sind, Google-Verbindung, letzter Lauf.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { SOURCES } from '../sources/index.js';
import { googleStatus, redirectUri, baseUrl, googleConfigured } from '../google/oauth.js';
import { notifyConfigured } from '../notify.js';
import { loadJSON, useSupabase } from '../store.js';
import { getConfig, ukey } from '../users.js';
import { mailConfigured } from '../mail.js';
import { baseOf } from '../collect.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const u = req.user;
  const cfg = getConfig(u);
  const [google, latest] = await Promise.all([googleStatus(u.id), loadJSON(ukey(u.id, 'latest'))]);
  const sources = SOURCES.map((s) => ({
    ...s.meta,
    configured: s.configured(cfg),
    missing: s.meta.needs.filter((k) => !cfg[k]),
  }));
  res.status(200).json({
    sources, google: { ...google, redirectUri: redirectUri(req) }, latest,
    webUrl: baseUrl(req),
    email: u.email,
    storage: useSupabase() ? 'supabase' : 'lokal (data/)',
    notify: notifyConfigured(u.settings || {}),
    cronConfigured: !!process.env.CRON_SECRET,
    googleAvailable: googleConfigured(),
    mailConfigured: mailConfigured(),
    baseCurrency: baseOf(u),
  });
}));
