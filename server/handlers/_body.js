// Request-Body als Objekt (Vercel liefert je nach Header String oder Objekt).
export function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body || {};
}

export const TTL_SEC = 30 * 24 * 3600;
