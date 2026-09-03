import { cookieHeader, isSecure } from '../auth.js';

export default async function handler(req, res) {
  res.setHeader('set-cookie', cookieHeader('', { maxAgeSec: 0, secure: isSecure(req) }));
  res.status(200).json({ angemeldet: false });
}
