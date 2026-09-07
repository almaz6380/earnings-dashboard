// CORS für die native App. Der Client läuft dort nicht auf unserer Domain, sondern
// unter capacitor://localhost (iOS) bzw. https://localhost (Android) und ruft die
// API per Bearer-Token auf. Andere Origins bekommen keine CORS-Header - Browser
// blocken dann wie bisher. Zusätzliche Origins (z. B. eine zweite Domain) über
// APP_ORIGINS=https://a.example,https://b.example.
const APP_ORIGINS = new Set(['capacitor://localhost', 'https://localhost', 'http://localhost', 'ionic://localhost']);

export function allowedOrigin(origin) {
  if (!origin) return false;
  if (APP_ORIGINS.has(origin)) return true;
  const extra = (process.env.APP_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return extra.includes(origin);
}

// Setzt die Header, wenn der Origin erlaubt ist. Gibt true zurück, wenn es ein
// Preflight (OPTIONS) war, der damit vollständig beantwortet ist.
export function applyCors(req, res) {
  const origin = req.headers?.origin;
  if (allowedOrigin(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    res.setHeader('access-control-max-age', '86400');
    res.setHeader('vary', 'Origin');
  }
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export function withCors(handler) {
  return async (req, res) => {
    if (applyCors(req, res)) return undefined;
    return handler(req, res);
  };
}
