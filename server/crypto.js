// AES-256-GCM für gespeicherte Refresh-Tokens. Schlüssel = SHA-256(TOKEN_ENC_KEY).
import crypto from 'node:crypto';

function key() {
  const secret = process.env.TOKEN_ENC_KEY;
  if (!secret || secret.length < 16) throw new Error('TOKEN_ENC_KEY fehlt oder ist zu kurz (mind. 16 Zeichen).');
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, enc] = String(payload).split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
