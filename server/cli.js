// Kommandozeile (lokal oder im Cron), Umgebungsvariablen aus .env:
//   node server/cli.js collect [--notify]              Sammellauf für alle Konten
//   node server/cli.js collect <email> [--notify]      Sammellauf für ein Konto
//   node server/cli.js migrate <email> <passwort>      altes Ein-Nutzer-Dashboard in ein Konto überführen
//   node server/cli.js users                           Konten auflisten
import 'dotenv/config';
import { runCollect, runCollectAll } from './collect.js';
import { createUser, findByEmail, listUserIds, getUser, ukey, setConfig } from './users.js';
import { loadJSON, saveJSON, deleteJSON } from './store.js';
import { SOURCES } from './sources/index.js';
import { konfiguration, nutzbare, neueId } from './quellen.js';

const [cmd = 'collect', ...args] = process.argv.slice(2);
const notify = args.includes('--notify');
const rest = args.filter((a) => !a.startsWith('--'));

if (cmd === 'collect') {
  if (rest[0]) {
    const u = await findByEmail(rest[0]);
    if (!u) { console.error(`Kein Konto für ${rest[0]}.`); process.exit(1); }
    const { latest, summary, laeuft } = await runCollect({ user: u, notify });
    if (laeuft) {
      console.log(`Ein anderer Sammellauf ist gerade unterwegs (seit ${latest?.collectedAt || 'unbekannt'}), nichts geändert.`);
    } else {
      console.log(JSON.stringify(latest.results, null, 1));
      console.log(`Gesamt gestern ${summary.kpis.yesterday} ${summary.baseCurrency} · 30 Tage ${summary.kpis.d30} ${summary.baseCurrency}`);
    }
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
  // Aus den flachen Umgebungsvariablen je Quelle einen Eintrag bauen. RevenueCat
  // hatte nummerierte Paare (_2 … _5), daraus werden mehrere Einträge.
  const quellen = {};
  for (const src of SOURCES) {
    const liste = [];
    for (const n of src.meta.id === 'revenuecat' ? [1, 2, 3, 4, 5] : [1]) {
      const suffix = n === 1 ? '' : `_${n}`;
      const eintrag = { id: neueId() };
      for (const f of src.meta.felder) if (process.env[`${f.key}${suffix}`]) eintrag[f.key] = process.env[`${f.key}${suffix}`];
      const label = process.env[`REVENUECAT_LABEL${suffix}`];
      if (src.meta.id === 'revenuecat' && label) eintrag.label = label;
      if (src.vollstaendig(eintrag)) liste.push(eintrag);
    }
    if (liste.length) quellen[src.meta.id] = liste;
  }
  await setConfig(u, { v: 2, quellen });
  for (const name of ['history', 'latest', 'google_tokens']) {
    const alt = await loadJSON(name);
    if (!alt) continue;
    await saveJSON(ukey(u.id, name), alt);
    await deleteJSON(name);
    console.log(`${name} -> Konto ${u.email}`);
  }
  const cfg = konfiguration(u);
  const uebernommen = SOURCES.filter((s) => nutzbare(cfg, s.meta.id).length).map((s) => `${s.meta.label} (${nutzbare(cfg, s.meta.id).length})`);
  console.log(`Konto ${u.email}: ${uebernommen.join(', ') || 'keine Quelle'} übernommen.`);
  console.log('Die Quellen-Variablen können jetzt aus der Umgebung entfernt werden.');
} else {
  console.error('Bekannt: collect, users, migrate');
  process.exit(1);
}
