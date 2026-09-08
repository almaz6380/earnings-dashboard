// Zustand des Kontos: Speicher, Benachrichtigung, letzter Lauf. Alles über die
// Quellen selbst (Einträge, Felder, Verbindungen) liefert /api/config.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { SOURCES } from '../sources/index.js';
import { redirectUri, baseUrl, googleConfigured } from '../google/oauth.js';
import { konfiguriert as rcKonfiguriert } from '../revenuecat/oauth.js';
import { notifyConfigured } from '../notify.js';
import { loadJSON, useSupabase } from '../store.js';
import { ukey } from '../users.js';
import { konfiguration, istEingerichtet } from '../quellen.js';
import { mailConfigured } from '../mail.js';
import { baseOf } from '../collect.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const u = req.user;
  const cfg = konfiguration(u);
  const latest = await loadJSON(ukey(u.id, 'latest'));
  res.status(200).json({
    latest,
    webUrl: baseUrl(req),
    email: u.email,
    eingerichtet: SOURCES.filter((s) => istEingerichtet(cfg, s.meta.id)).length,
    quellenGesamt: SOURCES.length,
    storage: useSupabase() ? 'supabase' : 'lokal (data/)',
    notify: notifyConfigured(u.settings || {}),
    cronConfigured: !!process.env.CRON_SECRET,
    googleAvailable: googleConfigured(),
    revenuecatLogin: rcKonfiguriert(),
    googleRedirectUri: redirectUri(req),
    mailConfigured: mailConfigured(),
    baseCurrency: baseOf(u),
  });
}));
