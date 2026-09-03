import { tryLogin, makeToken, cookieHeader, isAuthed, isSecure } from '../auth.js';

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ angemeldet: isAuthed(req) });
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  if (!process.env.DASHBOARD_PASSWORD) return res.status(500).json({ fehler: 'DASHBOARD_PASSWORD ist nicht gesetzt.' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const r = await tryLogin(req, body.password);
  if (!r.ok) {
    return res.status(401).json({ fehler: r.wartenSek ? `Zu viele Fehlversuche. Bitte ${Math.ceil(r.wartenSek / 60)} Min. warten.` : `Falsches Passwort.${r.verbleibend ? ` Noch ${r.verbleibend} Versuche.` : ''}` });
  }
  res.setHeader('set-cookie', cookieHeader(makeToken(), { maxAgeSec: 30 * 24 * 3600, secure: isSecure(req) }));
  res.status(200).json({ angemeldet: true });
}

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }
