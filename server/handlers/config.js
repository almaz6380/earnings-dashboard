// Quellen einrichten: Einträge lesen, anlegen, ändern, löschen.
// Geheimnisse gehen nie zurück an die App - nur „gesetzt" und die letzten Zeichen.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { SOURCES, byId } from '../sources/index.js';
import { konfiguration, eintraege, maskiere, speichereEintrag, loescheEintrag, istEingerichtet, nutztVerbindung } from '../quellen.js';
import { verbindungen, googleConfigured } from '../google/oauth.js';
import { status as rcStatus } from '../revenuecat/oauth.js';
import { body } from './_body.js';

async function antwort(u) {
  const cfg = konfiguration(u);
  return {
    quellen: SOURCES.map((s) => ({
      ...s.meta,
      configured: istEingerichtet(cfg, s.meta.id),
      eintraege: eintraege(cfg, s.meta.id).map((e, i) => maskiere(s, e, i)),
    })),
    google: { verfuegbar: googleConfigured(), verbindungen: await verbindungen(u.id) },
    revenuecat: await rcStatus(u.id),
  };
}

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const u = req.user;
  if (req.method === 'GET') return res.status(200).json(await antwort(u));
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur GET/POST.' });
  const b = body(req);
  const src = byId(b.quelle);
  if (!src) return res.status(400).json({ fehler: 'Unbekannte Quelle.' });
  try {
    if (b.action === 'delete') {
      if (!b.id) return res.status(400).json({ fehler: 'Welcher Eintrag?' });
      await loescheEintrag(u, b.quelle, b.id);
    } else {
      await speichereEintrag(u, b.quelle, b.eintrag || {});
    }
    return res.status(200).json(await antwort(u));
  } catch (e) {
    return res.status(400).json({ fehler: e.message });
  }
}));

// Für die Warnung beim Trennen einer Google-Verbindung.
export async function betroffeneQuellen(u, verbindungId) {
  return nutztVerbindung(konfiguration(u), verbindungId);
}
