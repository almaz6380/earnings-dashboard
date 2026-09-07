// Konfigurationsstand: welche Quellen eingerichtet sind, Google-Verbindung, letzter Lauf.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { SOURCES } from '../sources/index.js';
import { googleStatus, redirectUri, baseUrl } from '../google/oauth.js';
import { notifyConfigured } from '../notify.js';
import { loadJSON, useSupabase } from '../store.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const [google, latest] = await Promise.all([googleStatus(), loadJSON('latest')]);
  const sources = SOURCES.map((s) => ({
    ...s.meta,
    configured: s.configured(),
    missing: s.meta.needs.filter((k) => !process.env[k]),
  }));
  res.status(200).json({
    sources, google: { ...google, redirectUri: redirectUri(req) }, latest,
    // Die native App öffnet damit das Web-Dashboard, wenn Google verbunden werden soll.
    webUrl: baseUrl(req),
    storage: useSupabase() ? 'supabase' : 'lokal (data/)',
    notify: notifyConfigured(),
    cronConfigured: !!process.env.CRON_SECRET,
    baseCurrency: process.env.BASE_CURRENCY || 'EUR',
  });
}));
