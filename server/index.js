// Lokaler API-Server. Start: npm run server (oder npm run dev für Server + Client).
// In der Cloud (Vercel) läuft stattdessen api/index.js – über dieselbe Routentabelle.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTEN } from './routen.js';
import { speicherArt } from './store.js';
import { applyCors } from './cors.js';

const PORT = +(process.env.PORT || 3001);
const app = express();
app.use(express.json({ limit: '256kb' }));
// Preflights der nativen App (OPTIONS) beantworten, bevor die Routen greifen.
app.use('/api', (req, res, next) => (applyCors(req, res) ? undefined : next()));

// Wie in der Cloud: eine Adresse, alle Methoden – die Handler prüfen selbst,
// welche Methode sie zulassen.
for (const [pfad, handler] of Object.entries(ROUTEN)) app.all(pfad, handler);

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
