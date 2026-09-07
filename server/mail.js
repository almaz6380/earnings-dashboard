// E-Mail-Versand für „Passwort vergessen" über Resend (HTTP, kein Paket nötig).
// Ohne RESEND_API_KEY + MAIL_FROM gibt es kein Zurücksetzen per E-Mail.
export function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) throw new Error('E-Mail-Versand ist auf diesem Server nicht eingerichtet.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`E-Mail konnte nicht gesendet werden (${res.status}).`);
  return true;
}
