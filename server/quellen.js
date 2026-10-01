// Form der Quellen-Konfiguration eines Kontos.
//
// Version 1 war flach: ein Wert je Umgebungsvariablen-Name, also genau ein AdMob-Konto,
// ein Wise-Profil, ein App-Store-Team. Das trägt nicht: Wer AdMob privat und die Play
// Console über die Firma laufen hat, braucht zwei Google-Verbindungen; wer zwei
// AdMob-Konten hat, zwei Einträge.
//
// Version 2 ist darum eine Liste von Einträgen je Quelle:
//   { v: 2, quellen: { admob: [ { id, google, ADMOB_PUBLISHER_ID, label } ], … } }
// `google` verweist auf die Google-Verbindung, mit der dieser Eintrag abgefragt wird.
// Alte Konfigurationen werden beim ersten Lesen übersetzt und beim nächsten Speichern
// in der neuen Form abgelegt.
import crypto from 'node:crypto';
import { SOURCES, byId } from './sources/index.js';
import { getConfig, setConfig } from './users.js';

export const neueId = () => crypto.randomBytes(6).toString('base64url');

const MAX_EINTRAEGE = 10;

// ---- Migration von v1 ------------------------------------------------------

// RevenueCat hatte in v1 nummerierte Paare (_2 … _5), alle anderen genau einen Satz.
function ausFlach(flach) {
  const quellen = {};
  for (const src of SOURCES) {
    const id = src.meta.id;
    const liste = [];
    const nummern = id === 'revenuecat' ? [1, 2, 3, 4, 5] : [1];
    for (const n of nummern) {
      const suffix = n === 1 ? '' : `_${n}`;
      const eintrag = { id: neueId() };
      let etwas = false;
      for (const f of src.meta.felder) {
        const wert = flach[`${f.key}${suffix}`];
        if (wert) { eintrag[f.key] = wert; etwas = true; }
      }
      const label = flach[`REVENUECAT_LABEL${suffix}`];
      if (id === 'revenuecat' && label) eintrag.label = label;
      if (etwas && src.vollstaendig(eintrag)) liste.push(eintrag);
    }
    if (liste.length) quellen[id] = liste;
  }
  return { v: 2, quellen };
}

export function konfiguration(u) {
  const roh = getConfig(u);
  if (roh?.v === 2 && roh.quellen) return roh;
  // Leere Konfiguration oder alte flache Form.
  return Object.keys(roh || {}).length ? ausFlach(roh) : { v: 2, quellen: {} };
}

// ---- Lesen -----------------------------------------------------------------

export function eintraege(cfg, quelleId) {
  return cfg?.quellen?.[quelleId] || [];
}

// Nur Einträge, die vollständig genug für einen Abruf sind.
export function nutzbare(cfg, quelleId) {
  const src = byId(quelleId);
  return src ? eintraege(cfg, quelleId).filter((e) => src.vollstaendig(e)) : [];
}

export const istEingerichtet = (cfg, quelleId) => nutzbare(cfg, quelleId).length > 0;

// Anzeigename eines Eintrags: eigener Name, sonst ein Pflichtwert, sonst Nummer.
// Geheime Felder kommen dafür nie in Frage - ein API-Token als Überschrift stünde
// sonst im Klartext auf dem Bildschirm.
export function beschriftung(src, eintrag, index = 0) {
  if (eintrag.label) return eintrag.label;
  const offen = new Set(src.meta.felder.filter((f) => !f.secret).map((f) => f.key));
  const wert = src.meta.needs.filter((k) => offen.has(k)).map((k) => eintrag[k]).find(Boolean);
  const kurz = wert && String(wert).length <= 40 ? String(wert) : null;
  return kurz || `${src.meta.label} ${index + 1}`;
}

// Für die Anzeige: Geheimnisse nie zurückgeben, nur „gesetzt" und die letzten Zeichen.
export function maskiere(src, eintrag, index = 0) {
  const out = { id: eintrag.id, label: beschriftung(src, eintrag, index), google: eintrag.google || null, oauth: !!eintrag.oauth, werte: {} };
  for (const f of src.meta.felder) {
    const wert = eintrag[f.key];
    if (!wert) continue;
    out.werte[f.key] = f.secret
      ? { set: true, hint: String(wert).length > 8 ? `…${String(wert).slice(-4)}` : '••••' }
      : { set: true, value: String(wert) };
  }
  out.vollstaendig = src.vollstaendig(eintrag);
  return out;
}

// ---- Schreiben -------------------------------------------------------------

function saeubere(src, eingabe, vorher = {}) {
  const eintrag = { ...vorher };
  for (const f of src.meta.felder) {
    if (!(f.key in eingabe)) continue;
    const wert = eingabe[f.key];
    if (wert === null || wert === '') delete eintrag[f.key];
    else {
      const text = String(wert).trim().slice(0, 20000);
      eintrag[f.key] = f.saeubern ? f.saeubern(text) : text;
    }
  }
  if ('label' in eingabe) {
    const l = String(eingabe.label || '').trim().slice(0, 60);
    if (l) eintrag.label = l; else delete eintrag.label;
  }
  if ('google' in eingabe) {
    const g = String(eingabe.google || '').trim().slice(0, 40);
    if (g) eintrag.google = g; else delete eintrag.google;
  }
  if ('oauth' in eingabe) {
    if (eingabe.oauth) eintrag.oauth = true; else delete eintrag.oauth;
  }
  return eintrag;
}

// Eintrag anlegen oder ändern. Gibt die neue Konfiguration zurück.
export async function speichereEintrag(u, quelleId, eingabe = {}) {
  const src = byId(quelleId);
  if (!src) throw new Error('Unbekannte Quelle.');
  const cfg = konfiguration(u);
  const liste = [...eintraege(cfg, quelleId)];
  const i = eingabe.id ? liste.findIndex((e) => e.id === eingabe.id) : -1;
  if (i < 0 && liste.length >= MAX_EINTRAEGE) throw new Error(`Höchstens ${MAX_EINTRAEGE} Einträge je Quelle.`);
  if (i < 0 && !src.meta.mehrfach && liste.length >= 1) throw new Error(`${src.meta.label} lässt nur einen Eintrag zu.`);
  const eintrag = saeubere(src, eingabe, i >= 0 ? liste[i] : { id: neueId() });
  if (i >= 0) liste[i] = eintrag; else liste.push(eintrag);
  cfg.quellen[quelleId] = liste;
  await setConfig(u, cfg);
  return cfg;
}

export async function loescheEintrag(u, quelleId, id) {
  const cfg = konfiguration(u);
  const liste = eintraege(cfg, quelleId).filter((e) => e.id !== id);
  if (liste.length) cfg.quellen[quelleId] = liste; else delete cfg.quellen[quelleId];
  await setConfig(u, cfg);
  return cfg;
}

// Alle Einträge, die auf eine Google-Verbindung zeigen - für „Verbindung wirklich trennen?".
export function nutztVerbindung(cfg, verbindungId) {
  return SOURCES.flatMap((s) => eintraege(cfg, s.meta.id)
    .filter((e) => e.google === verbindungId)
    .map(() => s.meta.label));
}
