// Alle API-Adressen an einer Stelle. Der lokale Express-Server (server/index.js)
// und die eine Vercel-Funktion (api/index.js) lesen beide aus dieser Tabelle,
// damit lokal und in der Cloud nie unterschiedliche Wege existieren.
import state from './handlers/state.js';
import status from './handlers/status.js';
import collect from './handlers/collect.js';
import login from './handlers/login.js';
import logout from './handlers/logout.js';
import register from './handlers/register.js';
import account from './handlers/account.js';
import config from './handlers/config.js';
import discover from './handlers/discover.js';
import test from './handlers/test.js';
import password from './handlers/password.js';
import googleLink from './handlers/googleLink.js';
import googleStart from './handlers/googleStart.js';
import googleCallback from './handlers/googleCallback.js';
import googleDisconnect from './handlers/googleDisconnect.js';
import revenuecatLink from './handlers/revenuecatLink.js';
import revenuecatStart from './handlers/revenuecatStart.js';
import revenuecatCallback from './handlers/revenuecatCallback.js';
import revenuecatDisconnect from './handlers/revenuecatDisconnect.js';

// Kein Handler faengt Speicherfehler ab. Ohne Netz darunter beendet ein Fehler
// die ganze Funktion, und der Nutzer sieht nur "HTTP 500" - ohne Hinweis, dass
// die Datenbank haengt und nicht sein Passwort falsch ist.
export function sicher(handler, pfad) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (e) {
      console.error(`Fehler in ${pfad}:`, e);
      if (res.headersSent || res.writableEnded) return undefined;
      // Die Meldung selbst bleibt draussen: sie kann Teile der Antwort des
      // Speicheranbieters enthalten. Sie steht im Server-Log.
      res.setHeader('cache-control', 'no-store');
      return res.status(500).json({ fehler: 'Der Server kann gerade nicht auf seinen Speicher zugreifen. Bitte in ein paar Minuten erneut versuchen.' });
    }
  };
}

const ROH = {
  '/api/state': state,
  '/api/status': status,
  '/api/collect': collect,
  '/api/login': login,
  '/api/logout': logout,
  '/api/register': register,
  '/api/account': account,
  '/api/config': config,
  '/api/discover': discover,
  '/api/test': test,
  '/api/password': password,
  '/api/google/link': googleLink,
  '/api/google/start': googleStart,
  '/api/google/callback': googleCallback,
  '/api/google/disconnect': googleDisconnect,
  '/api/revenuecat/link': revenuecatLink,
  '/api/revenuecat/start': revenuecatStart,
  '/api/revenuecat/callback': revenuecatCallback,
  '/api/revenuecat/disconnect': revenuecatDisconnect,
};

export const ROUTEN = Object.fromEntries(
  Object.entries(ROH).map(([pfad, handler]) => [pfad, sicher(handler, pfad)])
);

// Doppelte Schrägstriche und ein Schrägstrich am Ende sollen nicht zu 404 führen.
export function normalisiere(pfad) {
  const ohneAbfrage = String(pfad || '').split('?')[0];
  const sauber = ohneAbfrage.replace(/\/{2,}/g, '/').replace(/(.)\/+$/, '$1');
  return sauber || '/';
}

export function finde(pfad) {
  return ROUTEN[normalisiere(pfad)] || null;
}
