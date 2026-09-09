// Öffentliche Kurzauskunft: was ist eingerichtet, was fehlt, antwortet der Speicher.
// Nur ja/nein und Namen - nie ein Wert. Sonst stünde ein Schlüssel offen im Netz.
import { withCors } from '../cors.js';
import { speicherArt, loadJSON } from '../store.js';
import { googleConfigured } from '../google/oauth.js';
import { konfiguriert as rcKonfiguriert } from '../revenuecat/oauth.js';
import { mailConfigured } from '../mail.js';

// Dieselben Regeln wie in auth.js und crypto.js: unter 16 Zeichen wird geworfen.
const zuKurz = (name) => !process.env[name] || process.env[name].length < 16;

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const fehlt = ['SESSION_SECRET', 'TOKEN_ENC_KEY'].filter(zuKurz);

  let speicherErreichbar = null;
  let speicherFehler = null;
  try {
    await loadJSON('health', null);
    speicherErreichbar = true;
  } catch (e) {
    speicherErreichbar = false;
    // Die Rohmeldung kann Teile der Antwort des Anbieters enthalten - nur die Art nennen.
    speicherFehler = 'Der Speicher antwortet nicht.';
    console.error('Speicher nicht erreichbar:', e);
  }

  const bereit = fehlt.length === 0 && speicherErreichbar === true;
  res.status(bereit ? 200 : 503).json({
    bereit,
    fehlt,
    speicher: speicherArt(),
    speicherErreichbar,
    ...(speicherFehler ? { speicherFehler } : {}),
    optional: {
      cron: !!process.env.CRON_SECRET,
      google: googleConfigured(),
      revenuecat: rcKonfiguriert(),
      mail: mailConfigured(),
    },
  });
});
