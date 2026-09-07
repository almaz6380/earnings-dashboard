// Konto: Anzeige, Einstellungen, Passwort ändern, Konto löschen.
import { requireAuth, makeToken, cookieHeader, isSecure } from '../auth.js';
import { withCors } from '../cors.js';
import { checkPassword, setPassword, setSettings, deleteUser, publicUser } from '../users.js';
import { BASES } from '../fx.js';
import { notifyConfigured, telegramBot } from '../notify.js';
import { body, TTL_SEC } from './_body.js';

export default withCors(requireAuth(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const u = req.user;
  const info = () => ({
    ...publicUser(u),
    currencies: BASES,
    notify: { active: notifyConfigured(u.settings || {}), telegramBot: telegramBot(), telegramAvailable: !!process.env.TELEGRAM_BOT_TOKEN },
  });
  if (req.method === 'GET') return res.status(200).json(info());
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur GET/POST.' });
  const b = body(req);
  try {
    if (b.action === 'settings') {
      await setSettings(u, b.settings || {});
      return res.status(200).json(info());
    }
    if (b.action === 'password') {
      if (!checkPassword(b.current, u.pw)) return res.status(401).json({ fehler: 'Aktuelles Passwort ist falsch.' });
      await setPassword(u, b.neu);
      // Neue Sitzung, weil die alte durch die Passwort-Version ungültig wurde.
      const token = makeToken(u);
      res.setHeader('set-cookie', cookieHeader(token, { maxAgeSec: TTL_SEC, secure: isSecure(req) }));
      return res.status(200).json({ ok: true, ...(b.token === true ? { token, gueltigSek: TTL_SEC } : {}) });
    }
    if (b.action === 'delete') {
      if (!checkPassword(b.password, u.pw)) return res.status(401).json({ fehler: 'Passwort ist falsch.' });
      await deleteUser(u);
      res.setHeader('set-cookie', cookieHeader('', { maxAgeSec: 0, secure: isSecure(req) }));
      return res.status(200).json({ ok: true, geloescht: true });
    }
    return res.status(400).json({ fehler: 'Unbekannte Aktion.' });
  } catch (e) {
    return res.status(400).json({ fehler: e.message });
  }
}));
