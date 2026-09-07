import { cookieHeader, isSecure } from '../auth.js';
import { withCors } from '../cors.js';

export default withCors(async function handler(req, res) {
  res.setHeader('set-cookie', cookieHeader('', { maxAgeSec: 0, secure: isSecure(req) }));
  res.status(200).json({ angemeldet: false });
});
