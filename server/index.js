// Lokaler API-Server. Start: npm run server (oder npm run dev für Server + Client).
// In der Cloud (Vercel) laufen stattdessen api/*.js – gleiche Handler.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import state from './handlers/state.js';
import status from './handlers/status.js';
import collect from './handlers/collect.js';
import login from './handlers/login.js';
import logout from './handlers/logout.js';
import googleStart from './handlers/googleStart.js';
import googleCallback from './handlers/googleCallback.js';
import googleDisconnect from './handlers/googleDisconnect.js';
import googleLink from './handlers/googleLink.js';
import register from './handlers/register.js';
import account from './handlers/account.js';
import config from './handlers/config.js';
import discover from './handlers/discover.js';
import test from './handlers/test.js';
import password from './handlers/password.js';
import revenuecatStart from './handlers/revenuecatStart.js';
import revenuecatCallback from './handlers/revenuecatCallback.js';
import revenuecatLink from './handlers/revenuecatLink.js';
import revenuecatDisconnect from './handlers/revenuecatDisconnect.js';
import { speicherArt } from './store.js';
import { applyCors } from './cors.js';

const PORT = +(process.env.PORT || 3001);
const app = express();
app.use(express.json({ limit: '256kb' }));
// Preflights der nativen App (OPTIONS) beantworten, bevor die GET/POST-Routen greifen.
app.use('/api', (req, res, next) => (applyCors(req, res) ? undefined : next()));

app.get('/api/state', state);
app.get('/api/status', status);
app.all('/api/collect', collect);
app.all('/api/login', login);
app.post('/api/logout', logout);
app.post('/api/register', register);
app.all('/api/account', account);
app.all('/api/config', config);
app.post('/api/discover', discover);
app.post('/api/test', test);
app.post('/api/password', password);
app.get('/api/google/link', googleLink);
app.get('/api/revenuecat/link', revenuecatLink);
app.get('/api/revenuecat/start', revenuecatStart);
app.get('/api/revenuecat/callback', revenuecatCallback);
app.post('/api/revenuecat/disconnect', revenuecatDisconnect);
app.get('/api/google/start', googleStart);
app.get('/api/google/callback', googleCallback);
app.post('/api/google/disconnect', googleDisconnect);

// Gebauter Client (npm run build), falls vorhanden – für lokale Vorschau ohne Vite
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`API-Server läuft auf http://localhost:${PORT} – Speicher: ${speicherArt()}`);
  const fehlt = ['SESSION_SECRET', 'TOKEN_ENC_KEY'].filter((k) => !process.env[k]);
  if (fehlt.length) console.warn(`Achtung, fehlt in .env: ${fehlt.join(', ')}`);
});
