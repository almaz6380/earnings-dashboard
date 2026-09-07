// Kommandozeile (lokal oder im Cron), Umgebungsvariablen aus .env:
//   node server/cli.js collect [--notify]              Sammellauf für alle Konten
//   node server/cli.js collect <email> [--notify]      Sammellauf für ein Konto
//   node server/cli.js migrate <email> <passwort>      altes Ein-Nutzer-Dashboard in ein Konto überführen
//   node server/cli.js users                           Konten auflisten
import 'dotenv/config';
import { runCollect, runCollectAll } from './collect.js';
import { createUser, findByEmail, setConfig, listUserIds, getUser, ukey } from './users.js';
import { loadJSON, saveJSON, deleteJSON } from './store.js';
import { SOURCES, FIELDS } from './sources/index.js';

const [cmd = 'collect', ...args] = process.argv.slice(2);
const notify = args.includes('--notify');
const rest = args.filter((a) => !a.startsWith('--'));

if (cmd === 'collect') {
  if (rest[0]) {
    const u = await findByEmail(rest[0]);
    if (!u) { console.error(`Kein Konto für ${rest[0]}.`); process.exit(1); }
    const { latest, summary } = await runCollect({ user: u, notify });
    console.log(JSON.stringify(latest.results, null, 1));
    console.log(`Gesamt gestern ${summary.kpis.yesterday} ${summary.baseCurrency} · 30 Tage ${summary.kpis.d30} ${summary.baseCurrency}`);
  } else {
    console.log(JSON.stringify(await runCollectAll({ notify, budgetMs: 10 * 60 * 1000 }), null, 1));
  }
} else if (cmd === 'users') {
  for (const id of await listUserIds()) {
    const u = await getUser(id);
    const latest = await loadJSON(ukey(id, 'latest'));
    console.log(`${u?.email}\t${id}\tseit ${u?.createdAt?.slice(0, 10)}\tletzter Lauf ${latest?.collectedAt || '–'}`);
  }
} else if (cmd === 'migrate') {
  // Aus dem alten Ein-Nutzer-Betrieb: Quellen-Keys aus der Umgebung ins Konto, Verlauf und Google-Token umhängen.
  const [email, password] = rest;
  if (!email || !password) { console.error('Aufruf: migrate <email> <passwort>'); process.exit(1); }
  const u = (await findByEmail(email)) || (await createUser({ email, password }));
  const patch = {};
  for (const k of FIELDS.keys()) if (process.env[k]) patch[k] = process.env[k];
  await setConfig(u, patch);
  for (const name of ['history', 'latest', 'google_tokens']) {
    const alt = await loadJSON(name);
    if (!alt) continue;
    await saveJSON(ukey(u.id, name), alt);
    await deleteJSON(name);
    console.log(`${name} -> Konto ${u.email}`);
  }
  console.log(`Konto ${u.email}: ${Object.keys(patch).length} Zugangsdaten übernommen (${SOURCES.filter((s) => s.configured(patch)).map((s) => s.meta.label).join(', ') || 'keine Quelle'}).`);
  console.log('Die Quellen-Variablen können jetzt aus der Umgebung entfernt werden.');
} else {
  console.error('Bekannt: collect, users, migrate');
  process.exit(1);
}
