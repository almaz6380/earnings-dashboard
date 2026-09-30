// Überträgt die gesetzten GitHub-Secrets als Worker-Secrets zu Cloudflare.
//
//   node scripts/cloudflare-secrets.mjs <ausgabe.json> NAME1 NAME2 ...
//
// Nur Namen mit Wert landen in der Datei - ein leeres GitHub-Secret soll einen
// vorhandenen Wert bei Cloudflare nicht überschreiben. Fehlt SESSION_SECRET überall,
// wird einmalig einer erzeugt: Er muss nur beständig sein, niemand muss ihn kennen.
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [ziel, ...namen] = process.argv.slice(2);
const werte = {};
for (const n of namen) if (process.env[n]) werte[n] = process.env[n];

if (!werte.SESSION_SECRET) {
  let vorhanden = [];
  try {
    vorhanden = JSON.parse(execFileSync('npx', ['--yes', 'wrangler@4', 'secret', 'list', '--format', 'json'], { encoding: 'utf8' })).map((s) => s.name);
  } catch { /* Worker neu: noch keine Secrets */ }
  if (!vorhanden.includes('SESSION_SECRET')) {
    werte.SESSION_SECRET = randomBytes(32).toString('hex');
    console.log('SESSION_SECRET neu erzeugt (einmalig).');
  }
}

writeFileSync(ziel, JSON.stringify(werte));
console.log(`Übertrage: ${Object.keys(werte).join(', ') || '(nichts)'}`);
