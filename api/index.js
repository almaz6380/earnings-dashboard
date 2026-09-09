// Eine einzige Vercel-Funktion für alle /api/... Adressen.
// Vorher lag je Endpunkt eine Datei in api/ – das sind 19 Funktionen, und der
// Hobby-Tarif erlaubt nur 12 pro Deployment. vercel.json leitet /api/:pfad*
// hierher um; die Zuordnung Pfad -> Handler steht in server/routen.js.
import { finde } from '../server/routen.js';

// Je nach Umleitung steht der ursprüngliche Pfad in req.url oder in ?pfad=.
// Beides prüfen und den ersten Treffer nehmen – so bleibt es unabhängig davon,
// wie Vercel die Umleitung intern durchreicht.
export function pfadKandidaten(req) {
  const liste = [];
  const roh = String(req.url || '').split('?')[0];
  if (roh) liste.push(roh);
  const q = req.query?.pfad;
  const ausAbfrage = Array.isArray(q) ? q.join('/') : q;
  if (ausAbfrage && !String(ausAbfrage).includes(':')) liste.push(`/api/${ausAbfrage}`);
  return liste;
}

export default async function handler(req, res) {
  for (const pfad of pfadKandidaten(req)) {
    const ziel = finde(pfad);
    if (ziel) return ziel(req, res);
  }
  res.setHeader('cache-control', 'no-store');
  return res.status(404).json({ fehler: 'Unbekannte Adresse.' });
}
