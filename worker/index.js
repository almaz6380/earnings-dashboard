// Einstieg für Cloudflare Workers.
//
// Seit dem 30.09.2026 läuft Einnahmen hier statt auf Vercel: Vercel hatte den ganzen
// Account pausiert, weil eine andere App ihr Kontingent überschritten hatte, und mit
// ihm dieses Dashboard. Workers Free kostet nichts und sperrt bei Überschreitung nur
// den einzelnen Aufruf, nie das Konto.
//
// Die Handler in server/ sind im Express-Stil geschrieben (req, res). Statt sie
// umzuschreiben, baut dieser Einstieg req und res aus der Fetch-Anfrage nach - genau
// die Teile, die die Handler benutzen (siehe Liste unten). So laufen lokal (Express),
// auf Vercel (api/index.js) und hier dieselben Handler.
//
// Statische Dateien (client/dist) liefert Cloudflare selbst aus, ohne diesen Code:
// wrangler.toml leitet nur /api/* hierher.
import { finde } from '../server/routen.js';

// Werte aus wrangler.toml ([vars]) und die Secrets auch über process.env erreichbar
// machen. Neuere Laufzeiten tun das bereits selbst; doppelt schadet nicht.
function envUebernehmen(env) {
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === 'string' && process.env[k] !== v) process.env[k] = v;
  }
}

async function leseBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const text = await request.text();
  if (!text) return undefined;
  // Wie Vercel: JSON wird vorab geparst, alles andere bleibt Text. _body.js kann beides.
  if ((request.headers.get('content-type') || '').includes('application/json')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

export async function alsReq(request) {
  const url = new URL(request.url);
  const headers = {};
  for (const [k, v] of request.headers) headers[k.toLowerCase()] = v;
  // baseUrl() und isSecure() lesen das Protokoll aus x-forwarded-proto, das Cloudflare
  // nicht mitschickt. Ohne das gingen OAuth-Rücksprünge an http:// und Cookies ohne Secure.
  headers['x-forwarded-proto'] ||= url.protocol.replace(':', '');
  headers['x-forwarded-for'] ||= request.headers.get('cf-connecting-ip') || '';
  const query = {};
  for (const [k, v] of url.searchParams) {
    query[k] = k in query ? [].concat(query[k], v) : v;
  }
  return {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    query,
    body: await leseBody(request),
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || undefined },
  };
}

// Benutzt werden: status, json, send, end, redirect, setHeader, headersSent, writableEnded.
export function neuesRes() {
  const res = {
    statusCode: 200,
    headers: new Headers(),
    body: null,
    headersSent: false,
    writableEnded: false,
    status(code) { res.statusCode = code; return res; },
    setHeader(name, value) {
      // set-cookie darf mehrfach vorkommen; alles andere ersetzt den alten Wert.
      if (name.toLowerCase() === 'set-cookie') {
        for (const v of [].concat(value)) res.headers.append('set-cookie', v);
      } else {
        res.headers.set(name, String(value));
      }
      return res;
    },
    json(obj) {
      if (!res.headers.has('content-type')) res.headers.set('content-type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify(obj));
    },
    send(text) {
      if (!res.headers.has('content-type')) res.headers.set('content-type', 'text/plain; charset=utf-8');
      return res.end(typeof text === 'string' ? text : String(text ?? ''));
    },
    redirect(code, ziel) {
      if (typeof code === 'string') { ziel = code; code = 302; }
      res.statusCode = code;
      res.headers.set('location', ziel);
      return res.end();
    },
    end(inhalt) {
      if (inhalt != null) res.body = inhalt;
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    },
  };
  return res;
}

export function alsResponse(res) {
  const ohneInhalt = res.statusCode === 204 || res.statusCode === 304;
  return new Response(ohneInhalt ? null : res.body, { status: res.statusCode, headers: res.headers });
}

export default {
  async fetch(request, env) {
    envUebernehmen(env);
    const url = new URL(request.url);
    const ziel = finde(url.pathname);
    if (!ziel) {
      // Alles außerhalb von /api/ gehört zu den statischen Dateien.
      if (!url.pathname.startsWith('/api/') && env.ASSETS) return env.ASSETS.fetch(request);
      return Response.json({ fehler: 'Unbekannte Adresse.' }, { status: 404, headers: { 'cache-control': 'no-store' } });
    }
    const req = await alsReq(request);
    const res = neuesRes();
    await ziel(req, res);
    if (!res.writableEnded) res.status(500).json({ fehler: 'Keine Antwort vom Handler.' });
    return alsResponse(res);
  },
};
