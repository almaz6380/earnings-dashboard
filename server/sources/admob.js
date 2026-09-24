// AdMob API: Netzwerk-Bericht, geschätzte Einnahmen pro Tag (Micros).
import { daysAgo } from '../http.js';

export const meta = { id: 'admob', label: 'AdMob', art: 'Werbeeinnahmen (Schätzung)', kind: 'earned',
  needs: ['ADMOB_PUBLISHER_ID'], google: true, mehrfach: true, entdeckbar: true,
  konsole: { url: 'https://apps.admob.com/v2/account/settings', text: 'AdMob-Kontoeinstellungen' },
  help: 'Wähle die Google-Verbindung, dann suchen wir die Publisher-ID selbst.',
  felder: [{ key: 'ADMOB_PUBLISHER_ID', label: 'Publisher-ID', hint: 'Form pub-1234567890123456' }] };

export const vollstaendig = (e) => !!e?.ADMOB_PUBLISHER_ID;

// Welche AdMob-Konten diese Google-Verbindung sieht. Erspart das Abtippen der ID.
export async function entdecke({ google }) {
  const r = await google.fetch('https://admob.googleapis.com/v1/accounts?pageSize=50');
  return (r.account || r.accounts || [])
    .filter((a) => a.publisherId)
    .map((a) => ({
      werte: { ADMOB_PUBLISHER_ID: a.publisherId },
      label: a.publisherId,
      hinweis: a.currencyCode ? `Währung ${a.currencyCode}` : null,
    }));
}

const dateObj = (d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });

// Der Bericht kennt nur die AdMob-App-ID. Welche Store-App dahintersteckt (und damit
// das Icon) und auf welcher Plattform sie läuft, steht in der App-Liste. Gleicher Scope,
// kein neuer Zugang nötig.
// Die Plattform kennt AdMob auch für Apps, die nicht mit einem Store verknüpft sind -
// sie hing früher an der Store-Kennung, und die iOS/Android-Aufteilung blieb dann leer.
export function storeInfoAusApps(json) {
  const out = {};
  for (const app of json?.apps || []) {
    const storeId = app.linkedAppInfo?.appStoreId;
    const platform = app.platform === 'IOS' ? 'ios' : app.platform === 'ANDROID' ? 'android' : null;
    if (!app.appId || (!storeId && !platform)) continue;
    const eintrag = { ...(storeId ? { storeId } : {}), ...(platform ? { platform } : {}) };
    out[app.appId] = eintrag;
    // Zusätzlich unter dem Teil nach der Tilde ablegen: Bericht und App-Liste sollten
    // dieselbe Schreibweise verwenden - täten sie es nicht, fände sich stillschweigend
    // kein Icon. Das hier kann nur einen Treffer hinzufügen, nie einen verhindern.
    const kurz = app.appId.split('~')[1];
    if (kurz) out[kurz] ||= eintrag;
  }
  return out;
}

// Zuordnung nachschlagen, beide Schreibweisen versuchen.
export const zuStore = (store, appId) => store[appId] || store[String(appId).split('~')[1]] || {};

async function storeInfo(pub, fetchJSON) {
  try {
    return storeInfoAusApps(await fetchJSON(`https://admob.googleapis.com/v1/accounts/${pub}/apps?pageSize=200`));
  } catch {
    return {}; // Ohne Zuordnung fehlen nur die Icons - der Bericht zählt weiter.
  }
}

export async function fetchData({ eintrag = {}, google, days = 60 } = {}) {
  const googleFetch = google.fetch;
  const pub = String(eintrag.ADMOB_PUBLISHER_ID || '').replace(/^accounts\//, '');
  const body = {
    reportSpec: {
      dateRange: { startDate: dateObj(daysAgo(days)), endDate: dateObj(new Date()) },
      dimensions: ['DATE', 'APP'],
      metrics: ['ESTIMATED_EARNINGS'],
      sortConditions: [{ dimension: 'DATE', order: 'ASCENDING' }],
    },
  };
  const [res, store] = await Promise.all([
    googleFetch(`https://admob.googleapis.com/v1/accounts/${pub}/networkReport:generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    storeInfo(pub, googleFetch),
  ]);
  return parseReport(res, store);
}

// Verarbeitet Antworten mit und ohne APP-Dimension. Ohne APP entfällt die Aufschlüsselung.
export function parseReport(res, store = {}) {
  const parts = Array.isArray(res) ? res : [res];
  const header = parts.find((p) => p.header)?.header || {};
  const currency = header.localizationSettings?.currencyCode || 'USD';
  const proTag = {};
  const apps = [];
  for (const p of parts) {
    const row = p.row;
    if (!row) continue;
    const d = row.dimensionValues?.DATE?.value || '';
    if (!/^\d{8}$/.test(d)) continue;
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const amount = Number(row.metricValues?.ESTIMATED_EARNINGS?.microsValue ?? 0) / 1e6;
    proTag[date] = round2((proTag[date] || 0) + amount);
    const app = row.dimensionValues?.APP;
    if (app) apps.push({ id: app.value, name: app.displayLabel || app.value, date, amount, currency, ...zuStore(store, app.value) });
  }
  const daily = Object.entries(proTag).sort().map(([date, amount]) => ({ date, amount, currency }));
  return { currency, asOf: new Date().toISOString(), daily, apps, balance: null, extra: {}, note: 'AdMob meldet mit 1–2 Tagen Verzug. Das Guthaben führt Google gemeinsam mit AdSense.' };
}

const round2 = (x) => Math.round(x * 100) / 100;
