// Eine Frage, eine Zeile Antwort: Wann wurde für dieses Konto zuletzt gesammelt?
//
// Danach fragt die offene App im Minutentakt, damit neue Zahlen des geplanten
// Sammellaufs (GitHub Actions, alle Quellen) von selbst erscheinen, statt bis zum
// nächsten Tippen auf „Aktualisieren" zu warten. /api/state ginge dafür nicht: es baut
// die Zusammenfassung über zwei Jahre Verlauf neu, und im Worker sind nur 10 ms CPU je
// Aufruf erlaubt (docs/CLOUDFLARE.md). Hier ist es ein Schlüssel aus dem Speicher.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { loadJSON } from '../store.js';
import { ukey } from '../users.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const latest = await loadJSON(ukey(req.user.id, 'latest'));
  res.status(200).json({ collectedAt: latest?.collectedAt || null });
}));
