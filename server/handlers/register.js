import { signupAllowed } from '../auth.js';
import { withCors } from '../cors.js';
import { createUser } from '../users.js';
import { body } from './_body.js';
import { sessionResponse } from './login.js';

export const signupOpen = () => process.env.SIGNUP !== 'closed';

export default withCors(async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ fehler: 'Nur POST.' });
  if (!signupOpen()) return res.status(403).json({ fehler: 'Die Registrierung ist auf diesem Server geschlossen.' });
  const b = body(req);
  if (b.accept !== true) return res.status(400).json({ fehler: 'Bitte Datenschutzerklärung und Nutzungsbedingungen akzeptieren.' });
  if (!(await signupAllowed(req))) return res.status(429).json({ fehler: 'Zu viele Registrierungen. Bitte später erneut versuchen.' });
  try {
    const u = await createUser({ email: b.email, password: b.password });
    return sessionResponse(req, res, u, b.token);
  } catch (e) {
    return res.status(400).json({ fehler: e.message });
  }
});
