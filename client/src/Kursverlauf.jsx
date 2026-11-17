import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtDay, fmtMonth, SOURCE_ORDER } from './format.js';
import { KursLinie, farbe } from './charts.jsx';
import { Punkt } from './components.jsx';
import { AppZeile } from './Zusammensetzung.jsx';
import { tagesKurve, runde } from './kennzahlen.js';

const ZEITRAEUME = [
  { id: '1T', t: '1T' }, { id: '1W', t: '1W', tage: 7 }, { id: '1M', t: '1M', tage: 30 }, { id: '3M', t: '3M', tage: 90 },
  { id: '1J', t: '1J', monate: 12 }, { id: 'max', t: 'Max', monate: Infinity },
];
const MAX_APPS = 6;
const SECHS_STUNDEN = 6 * 3600000;

const uhr = (ms) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

// Die große Kurve der Übersicht: Zeitraum wählen, mit dem Finger durchfahren, und Zahl
// und Aufteilung folgen dem Punkt unter dem Finger. Losgelassen gilt wieder der letzte Stand.
export default function Kursverlauf({ s, reihe }) {
  const cur = s.baseCurrency;
  const [art, setArt] = useState('1T');
  const [aktiv, setAktiv] = useState(null);
  const zeitraum = ZEITRAEUME.find((z) => z.id === art);
  const kanalIds = SOURCE_ORDER.filter((id) => s.bySource[id]?.countsInTotal && s.bySource[id].hasDaily);
  const kanaeleAus = (zeile) => Object.fromEntries(kanalIds.map((id) => [id, zeile?.[id] || 0]));

  // Je Zeitraum dieselbe Form: x, wert, kanaele und - wo bekannt - Betrag je App und Kanal.
  const daten = useMemo(() => {
    if (art === '1T') {
      return tagesKurve(s.intraday?.heute, s.intraday?.gestern, s.todayDate).map((r) => ({
        ...r, kanaele: r.punkt ? kanaeleAus(r.punkt) : null, apps: r.punkt?.apps || null,
      }));
    }
    if (zeitraum.tage) {
      return reihe.slice(-zeitraum.tage).map((r) => ({
        x: r.date, wert: r.total, kanaele: kanaeleAus(r),
        apps: Object.fromEntries((s.apps || []).filter((a) => a.tage?.[r.date])
          .map((a) => [a.key, Object.fromEntries(a.sources.map((q) => [q.id, q.tage?.[r.date] || 0]))])),
      }));
    }
    const monate = s.monthly.filter((m) => m.total || kanalIds.some((id) => m[id]));
    return (zeitraum.monate === Infinity ? monate : monate.slice(-zeitraum.monate))
      .map((m) => ({ x: m.month, wert: m.total, kanaele: kanaeleAus(m), apps: null }));
  }, [art, s, reihe]);

  const istTag = art === '1T';
  const letzter = daten.reduce((a, d, i) => (d.wert != null ? i : a), -1);
  // Rechts vom Jetzt gibt es für heute nichts zu zeigen; dort bleibt der letzte Stand stehen.
  const faehrt = aktiv != null && daten[aktiv]?.wert != null;
  const punkt = daten[faehrt ? aktiv : letzter] || null;
  const leer = letzter < 0;

  const fmtX = (x) => (istTag ? uhr(x) : zeitraum.tage ? fmtDay(x).slice(0, 6) : fmtMonth(x));
  const summe = runde(daten.reduce((a, d) => a + (d.wert || 0), 0));
  const tagStart = istTag ? Date.parse(`${s.todayDate}T00:00:00Z`) : 0;

  // Kopfzeile: beim Durchfahren der Punkt, sonst der Stand des Zeitraums.
  let label, wert, zusatz;
  if (istTag) {
    const davor = faehrt ? daten.slice(0, aktiv).reverse().find((d) => d.wert !== punkt.wert) : null;
    label = faehrt ? `Heute · ${uhr(punkt.x)} Uhr` : `Heute · ${fmtDay(s.todayDate).slice(0, 6)}`;
    // Direkt nach dem Einbau gibt es noch keinen Zwischenstand, die Tagessumme aber schon.
    const gemeldet = !!s.todaySources?.length;
    wert = leer ? (gemeldet ? s.kpis.today : null) : punkt.wert;
    zusatz = leer && !gemeldet
      ? 'noch keine Meldung'
      : faehrt
        ? [davor && `${fmtMoney(runde(punkt.wert - davor.wert), cur)} mehr als davor`, punkt.gestern != null && `gestern um diese Zeit ${fmtMoney(punkt.gestern, cur)}`].filter(Boolean).join(' · ')
        : s.todayFehlend?.length ? `bisher nur ${s.todaySources.join(' und ')}` : 'läuft noch, unvollständig';
  } else if (faehrt) {
    label = zeitraum.tage ? fmtDay(punkt.x) : fmtMonth(punkt.x);
    wert = punkt.wert;
    zusatz = zeitraum.tage ? 'an diesem Tag' : 'in diesem Monat';
  } else {
    label = leer ? zeitraum.t : `${fmtX(daten[0].x)} – ${fmtX(daten[daten.length - 1].x)}`;
    wert = leer ? null : summe;
    zusatz = leer ? 'noch keine Werte' : zeitraum.tage
      ? `Summe · im Schnitt ${fmtMoney(summe / daten.length, cur)} je Tag`
      : `Summe · im Schnitt ${fmtMoney(summe / daten.length, cur)} je Monat`;
  }

  const kanaele = punkt?.kanaele
    ? kanalIds.map((id) => ({ id, name: s.bySource[id].label, wert: punkt.kanaele[id] })).filter((k) => k.wert > 0).sort((a, b) => b.wert - a.wert)
    : [];
  const kanalSumme = kanaele.reduce((a, k) => a + k.wert, 0);
  const apps = punkt?.apps
    ? (s.apps || []).map((a) => {
      const teile = a.sources.map((q) => ({ id: q.id, label: q.label, wert: punkt.apps[a.key]?.[q.id] || 0 }));
      return { ...a, teile, wert: runde(teile.reduce((x, t) => x + t.wert, 0)) };
    }).filter((a) => a.wert > 0).sort((a, b) => b.wert - a.wert)
    : [];
  const gezeigt = apps.slice(0, MAX_APPS);
  const uebrige = apps.slice(MAX_APPS);
  const stand = faehrt ? (istTag ? `um ${uhr(punkt.x)} Uhr` : fmtX(punkt.x)) : istTag ? 'aktueller Stand' : `zuletzt · ${punkt ? fmtX(punkt.x) : ''}`;

  return (
    <div className="hero kurs">
      <div className="hero-kopf">
        <div style={{ minWidth: 0 }}>
          <div className="hero-label">{label}</div>
          <div className="hero-wert">{wert == null ? '–' : fmtMoney(wert, cur)}</div>
          <div className="kurs-zusatz">{zusatz}</div>
        </div>
      </div>

      {/* Losgelassen zählt wieder der letzte Stand - auf dem Telefon gibt es kein „Maus verlässt". */}
      <div className="kurs-flaeche" onTouchEnd={() => setAktiv(null)} onTouchCancel={() => setAktiv(null)}>
        {leer ? (
          <div className="kurs-leer">{istTag ? 'Der Stundenverlauf beginnt mit dem nächsten Abruf.' : 'Für diesen Zeitraum gibt es noch keine Werte.'}</div>
        ) : (
          <KursLinie daten={daten} stufen={istTag} zahlenAchse={istTag} vergleich={istTag} onAktiv={setAktiv} fmtTick={fmtX}
            bereich={istTag ? [tagStart, tagStart + 86400000] : undefined}
            ticks={istTag ? [0, 1, 2, 3, 4].map((i) => tagStart + i * SECHS_STUNDEN) : undefined} />
        )}
      </div>

      <div className="kurs-wahl">
        <div className="segment">
          {ZEITRAEUME.map((z) => (
            <button key={z.id} className={art === z.id ? 'active' : ''} onClick={() => { setArt(z.id); setAktiv(null); }}>{z.t}</button>
          ))}
        </div>
        {istTag && !leer && daten.some((d) => d.gestern != null) && <span className="kurs-legende"><i />gestern</span>}
      </div>

      {kanaele.length > 0 && (
        <div className="kurs-teile">
          <div className="zs-block" style={{ marginTop: 0 }}>Woraus · {stand}</div>
          <div className="anteil">
            {kanaele.map((k) => <div key={k.id} className="anteil-seg" style={{ flexGrow: k.wert, background: farbe(k.id) }} />)}
          </div>
          <div className="zs-kanal-liste">
            {kanaele.map((k) => (
              <div key={k.id} className="zs-kanal">
                <Punkt farbe={farbe(k.id)} /><span className="nm">{k.name}</span>
                <i>{Math.round((k.wert / kanalSumme) * 100)} %</i><b>{fmtMoney(k.wert, cur)}</b>
              </div>
            ))}
          </div>
          {gezeigt.length > 0 && (
            <div className="zs-apps" style={{ marginTop: 14 }}>
              {gezeigt.map((a) => <AppZeile key={a.key} name={a.name} icon={a.icon} wert={a.wert} teile={a.teile} max={apps[0].wert} cur={cur} />)}
              {uebrige.length > 0 && (
                <div className="kurs-uebrige">und {uebrige.length} weitere mit zusammen {fmtMoney(runde(uebrige.reduce((x, a) => x + a.wert, 0)), cur)}</div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="hinweis klein kurs-hinweis">
        {istTag
          ? 'Die Dienste melden nur Tagessummen. Die Kurve zeigt, wo der Tag bei jedem Abruf stand; lag länger kein Abruf dazwischen, steht der Zuwachs am späteren Punkt. Der Tag wechselt um Mitternacht UTC.'
          : zeitraum.tage
            ? 'Je Tag, bis zum letzten abgeschlossenen Tag. Mit dem Finger durchfahren zeigt jeden Tag einzeln.'
            : 'Je Monat; der laufende Monat ist noch nicht vollständig. Die Aufteilung nach App gibt es nur für Tage.'}
      </p>
    </div>
  );
}
