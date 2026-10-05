// Eine Frage, eine Zeile Antwort: Wann wurde für dieses Konto zuletzt gesammelt?
//
// Danach fragt die offene App im Sekundentakt, damit neue Zahlen - vom geplanten
// Sammellauf oder von einem anderen Gerät - von selbst erscheinen, statt bis zum
// nächsten Tippen auf „Aktualisieren" zu warten. Deshalb ist dieser Handler der
// billigste im Haus:
//   - /api/state ginge nicht: es baut die Zusammenfassung über zwei Jahre Verlauf neu,
//     und im Worker sind nur 10 ms CPU je Aufruf erlaubt (docs/CLOUDFLARE.md).
//   - Konto und letzter Lauf kommen in einem MGET statt in zwei GET: jeder Befehl
//     zählt im Kontingent des Speichers, und bei diesem Takt zählt das doppelt.
// Geprüft wird trotzdem wie überall: Signatur des Tokens und Passwort-Version des
// Kontos, damit ein Token nach einem Passwortwechsel auch hier nichts mehr erfährt.
import { sessionOf } from '../auth.js';
import { withCors } from '../cors.js';
import { loadManyJSON } from '../store.js';
import { ukey, userKey } from '../users.js';

export default withCors(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const s = sessionOf(req);
  if (!s) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
  const [u, latest] = await loadManyJSON([userKey(s.id), ukey(s.id, 'latest')]);
  if (!u || (u.pwv || 1) !== s.pwv) return res.status(401).json({ fehler: 'Nicht angemeldet.' });
  return res.status(200).json({ collectedAt: latest?.collectedAt || null });
});
