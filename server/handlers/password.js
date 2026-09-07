// Passwort vergessen: Link per E-Mail (1 Stunde gültig), dann neues Passwort setzen.
import crypto from 'node:crypto';
import { withCors } from '../cors.js';
import { loadJSON, saveJSON, deleteJSON } from '../store.js';
import { findByEmail, getUser, setPassword, normEmail } from '../users.js';
import { mailConfigured, sendMail } from '../mail.js';
import { baseUrl } from '../google/oauth.js';
import { body } from './_body.js';

const TTL_MS = 60 * 60 * 1000;
const key = (t) => `reset:${crypto.createHash('sha256').update(t).digest('base64url')}`;

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  const b = body(req);
  if (b.action === 'forgot') {
    if (!mailConfigured()) return res.status(400).json({ fehler: 'Passwort-Zurücksetzen per E-Mail ist auf diesem Server nicht eingerichtet. Bitte den Betreiber kontaktieren.' });
    const u = await findByEmail(b.email);
    // Immer dieselbe Antwort, damit niemand E-Mail-Adressen abfragen kann.
    if (u) {
      const t = crypto.randomBytes(24).toString('base64url');
      await saveJSON(key(t), { id: u.id, exp: Date.now() + TTL_MS });
      const link = `${baseUrl(req)}/?reset=${t}`;
      try {
        await sendMail({ to: u.email, subject: 'Einnahmen: Passwort zurücksetzen',
          text: `Hallo,\n\njemand hat für ${u.email} ein neues Passwort angefordert. Mit diesem Link kannst du eines setzen (1 Stunde gültig):\n\n${link}\n\nWarst du das nicht, ignoriere diese Mail - dein Passwort bleibt wie es ist.` });
      } catch (e) { return res.status(500).json({ fehler: e.message }); }
    }
    return res.status(200).json({ ok: true, hinweis: `Falls es ein Konto für ${normEmail(b.email)} gibt, ist eine E-Mail unterwegs.` });
  }
  if (b.action === 'reset') {
    const k = key(String(b.token || ''));
    const r = await loadJSON(k);
    if (!r || r.exp < Date.now()) return res.status(400).json({ fehler: 'Der Link ist ungültig oder abgelaufen. Bitte erneut anfordern.' });
    const u = await getUser(r.id);
    if (!u) return res.status(400).json({ fehler: 'Konto nicht gefunden.' });
    try { await setPassword(u, b.password); } catch (e) { return res.status(400).json({ fehler: e.message }); }
    await deleteJSON(k);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ fehler: 'Unbekannte Aktion.' });
});
