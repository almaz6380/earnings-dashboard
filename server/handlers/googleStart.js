import { isAuthed } from '../auth.js';
import { googleConfigured, authUrl, makeState } from '../google/oauth.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).send('Nicht angemeldet.');
  if (!googleConfigured()) return res.status(500).send('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET fehlen.');
  res.redirect(302, authUrl(makeState()));
}
