// Zugangsdaten der Quellen je Konto: nie im Klartext zurückgeben, nur „gesetzt" + Endung.
import { requireAuth } from '../auth.js';
import { withCors } from '../cors.js';
import { getConfig, setConfig, maskConfig } from '../users.js';
import { SOURCES, FIELDS } from '../sources/index.js';
import { body } from './_body.js';

function antwort(cfg) {
  return {
    values: maskConfig(cfg, FIELDS),
    configured: Object.fromEntries(SOURCES.map((s) => [s.meta.id, s.configured(cfg)])),
  };
}

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET') return res.status(200).json(antwort(getConfig(req.user)));
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur GET/POST.' });
  const b = body(req);
  const patch = {};
  for (const [k, v] of Object.entries(b.values || {})) {
    if (!FIELDS.has(k)) continue;           // nur bekannte Felder
    if (v === undefined) continue;
    patch[k] = v === null ? '' : String(v); // '' = löschen
  }
  const cfg = await setConfig(req.user, patch);
  return res.status(200).json(antwort(cfg));
}));
