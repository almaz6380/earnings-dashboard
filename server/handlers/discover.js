// Konten suchen statt abtippen: fragt die Quelle, welche Konten, Projekte oder
// Profile der hinterlegte Zugang sieht.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { byId } from '../sources/index.js';
import { konfiguration, eintraege } from '../quellen.js';
import { zugaenge } from '../collect.js';
import { body } from './_body.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  const u = req.user;
  const b = body(req);
  const src = byId(b.quelle);
  if (!src?.entdecke) return res.status(400).json({ fehler: 'Diese Quelle kann keine Konten auflisten.' });

  // Die App schickt nur, was im Formular steht. Ein bereits gespeichertes Geheimnis
  // (etwa ein Wise-Token) steht dort nicht - darum über den gespeicherten Eintrag legen.
  const gespeichert = b.eintrag?.id
    ? eintraege(konfiguration(u), b.quelle).find((e) => e.id === b.eintrag.id) || {}
    : {};
  const eintrag = { ...gespeichert, ...(b.eintrag || {}) };
  for (const [k, v] of Object.entries(eintrag)) if (v === '' || v === null) delete eintrag[k];

  try {
    const kandidaten = await src.entdecke(zugaenge(u, src, eintrag));
    return res.status(200).json({ kandidaten });
  } catch (e) {
    return res.status(400).json({ fehler: e.message.slice(0, 300) });
  }
}));
