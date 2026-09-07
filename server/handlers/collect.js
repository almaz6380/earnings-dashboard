// Sammellauf: per Cron (Secret) oder angemeldet über den Button "Jetzt aktualisieren".
import { cronOk, isAuthed } from '../auth.js';
import { withCors } from '../cors.js';
import { runCollect } from '../collect.js';

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const viaCron = cronOk(req);
  if (!viaCron && !isAuthed(req)) return res.status(401).json({ fehler: 'Falsches oder fehlendes Secret.' });
  try {
    // Benachrichtigung nur beim Cron-Lauf, nicht bei jedem Klick im Dashboard
    const { latest } = await runCollect({ notify: viaCron && req.query?.notify !== '0' });
    res.status(200).json(latest);
  } catch (e) {
    res.status(500).json({ fehler: e.message });
  }
});
