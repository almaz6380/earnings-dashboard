// Probeabruf beim Einrichten: sagt sofort, ob die Zugangsdaten stimmen, statt den
// Nutzer bis zum nächsten Sammellauf im Unklaren zu lassen. Schreibt nichts in den
// Verlauf - dafür ist „Aktualisieren" da.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { byId } from '../sources/index.js';
import { konfiguration, eintraege, beschriftung } from '../quellen.js';
import { zugaenge } from '../collect.js';
import { body } from './_body.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  const u = req.user;
  const b = body(req);
  const src = byId(b.quelle);
  if (!src) return res.status(400).json({ fehler: 'Unbekannte Quelle.' });
  const liste = eintraege(konfiguration(u), b.quelle);
  const i = b.id ? liste.findIndex((e) => e.id === b.id) : 0;
  const eintrag = liste[i < 0 ? 0 : i];
  if (!eintrag || !src.vollstaendig(eintrag)) return res.status(400).json({ fehler: 'Der Eintrag ist noch nicht vollständig.' });

  try {
    // Kleines Fenster: der Test soll Sekunden dauern, nicht den vollen Verlauf holen.
    const daten = await src.fetchData({ ...zugaenge(u, src, eintrag), days: 3, months: 1 });
    const tage = daten.daily?.length || 0;
    const stände = daten.balances?.length || (daten.balance ? 1 : 0);
    return res.status(200).json({
      ok: true,
      label: beschriftung(src, eintrag, i < 0 ? 0 : i),
      tage,
      staende: stände,
      auszahlungen: daten.payouts?.length || 0,
      note: daten.note || null,
      // Auch ein erfolgreicher Abruf ohne Zahlen ist eine Antwort wert.
      text: tage || stände || daten.payouts?.length
        ? `Verbindung steht. ${[tage && `${tage} Tage`, stände && `${stände} Kontostände`, daten.payouts?.length && `${daten.payouts.length} Auszahlungen`].filter(Boolean).join(', ')} empfangen.`
        : 'Verbindung steht, es liegen aber noch keine Zahlen vor.',
    });
  } catch (e) {
    return res.status(400).json({ fehler: e.message.slice(0, 400) });
  }
}));
