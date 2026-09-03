// Kommandozeile: `npm run collect` – ein Sammellauf ohne Server (lokal oder im Cron).
import 'dotenv/config';
import { runCollect } from './collect.js';

const cmd = process.argv[2] || 'collect';
if (cmd !== 'collect') { console.error('Bekannt: collect'); process.exit(1); }
const { latest, summary } = await runCollect({ notify: process.argv.includes('--notify') });
console.log(JSON.stringify(latest.results, null, 1));
console.log(`Gesamt gestern ${summary.kpis.yesterday} ${summary.baseCurrency} · 30 Tage ${summary.kpis.d30} ${summary.baseCurrency}`);
