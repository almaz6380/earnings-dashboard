// App-Icons aus den Stores. Apple hat dafür eine öffentliche Schnittstelle;
// bei Google Play gibt es keine, dort lesen wir das Vorschaubild der Store-Seite.
// Findet sich nichts, wird null zurückgegeben - der Client zeigt dann ein Monogramm.
import { loadJSON, saveJSON } from './store.js';

const TAG = 86400000;
const FRISCH_GEFUNDEN = 30; // Tage, bis ein gefundenes Icon erneut geprüft wird
const FRISCH_LEER = 7;      // erfolglose Suche früher wiederholen (App kann neu sein)

// Apple liefert mehrere Größen; die größte zuerst.
export function ausITunes(json) {
  const r = json?.results?.[0];
  return r?.artworkUrl512 || r?.artworkUrl100 || r?.artworkUrl60 || null;
}

// Play-Store-Seite: das Icon steht als og:image im Kopf der Seite.
export function ausPlaySeite(html) {
  const m = String(html || '').match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  return m ? m[1] : null;
}

export const iconKey = (platform, storeId) => `${platform}:${storeId}`;

async function holeText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; earnings-dashboard)' } });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

async function holeJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Ein einzelnes Icon suchen. Wirft nie - ohne Treffer kommt null zurück.
export async function findeIcon({ platform, storeId }, { fetchJSON = holeJSON, fetchText = holeText } = {}) {
  if (!platform || !storeId) return null;
  try {
    if (platform === 'ios') {
      return ausITunes(await fetchJSON(`https://itunes.apple.com/lookup?id=${encodeURIComponent(storeId)}`));
    }
    if (platform === 'android') {
      return ausPlaySeite(await fetchText(`https://play.google.com/store/apps/details?id=${encodeURIComponent(storeId)}&hl=de`));
    }
  } catch { /* Store nicht erreichbar oder App unbekannt - dann eben kein Icon */ }
  return null;
}

// Alle Apps im Verlauf mit einem Icon versehen. Ergebnisse liegen im Speicher,
// damit nicht jeder Sammellauf iTunes und Play anfragt.
export async function ergaenzeIcons(history, { jetzt = new Date(), sucher = findeIcon } = {}) {
  const cache = (await loadJSON('icons')) || {};
  let neu = false;

  for (const proQuelle of Object.values(history.apps || {})) {
    for (const app of Object.values(proQuelle)) {
      if (!app?.platform || !app?.storeId) continue;
      const key = iconKey(app.platform, app.storeId);
      const eintrag = cache[key];
      const alter = eintrag?.geprueft ? (jetzt - new Date(eintrag.geprueft)) / TAG : Infinity;
      const frisch = alter < (eintrag?.url ? FRISCH_GEFUNDEN : FRISCH_LEER);
      if (!frisch) {
        cache[key] = { url: await sucher({ platform: app.platform, storeId: app.storeId }), geprueft: jetzt.toISOString().slice(0, 10) };
        neu = true;
      }
      app.icon = cache[key].url || null;
    }
  }

  if (neu) await saveJSON('icons', cache);
  return cache;
}
