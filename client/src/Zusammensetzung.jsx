import React, { useState } from 'react';
import { fmtMoney, fmtDay, SOURCE_ORDER } from './format.js';
import { farbe } from './charts.jsx';
import { Delta, Punkt } from './components.jsx';
import { bereichFuer, summeTage, summeZwischen, anteil, runde } from './kennzahlen.js';
import AppIcon from './AppIcon.jsx';

// Mehr Zeilen liest beim Öffnen niemand; der Rest steht gesammelt darunter.
const MAX_APPS = 8;

// Eine App mit Betrag und einem Balken, der zugleich zeigt, aus welchen Kanälen der
// Betrag kommt. Die Länge ist relativ zur größten App, damit die Zeilen vergleichbar sind.
export function AppZeile({ name, icon, wert, teile, max, cur, zaehler }) {
  const sichtbar = teile.filter((t) => t.wert > 0);
  return (
    <div className={`zs-app${wert ? '' : ' null'}`}>
      {icon !== false
        ? <AppIcon src={icon} name={name} color={farbe(teile[0]?.id)} size={30} />
        : <span className="zs-rest">{zaehler}</span>}
      <div className="zs-mitte">
        <div className="zs-kopf">
          <span className="nm">{name}</span>
          <b>{fmtMoney(wert, cur)}</b>
        </div>
        <div className="zs-spur">
          <div className="zs-stapel" style={{ width: `${max > 0 ? Math.max(2, (wert / max) * 100) : 0}%` }}>
            {sichtbar.map((t) => (
              <div key={t.id} style={{ flexGrow: t.wert, background: farbe(t.id) }} title={`${t.label}: ${fmtMoney(t.wert, cur)}`} />
            ))}
          </div>
        </div>
        {/* Nur bei mehr als einem Kanal: bei einem sagt der Balken schon alles. */}
        {sichtbar.length > 1 && (
          <div className="zs-kanaele">
            {sichtbar.map((t) => (
              <span key={t.id}><Punkt farbe={farbe(t.id)} />{t.label} {fmtMoney(t.wert, cur)}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Eine Liste von Apps mit Kanal-Aufteilung, gemeinsam für „Heute" und die Zusammensetzung.
// `wertFuer(tage)` rechnet aus den Tageswerten den Betrag im gewünschten Zeitraum.
export function AppListe({ apps, wertFuer, cur, maxZeilen = Infinity, mitLeeren = false }) {
  const liste = apps
    .map((a) => ({
      ...a,
      wert: wertFuer(a.tage),
      teile: SOURCE_ORDER
        .map((id) => a.sources.find((q) => q.id === id))
        .filter(Boolean)
        .map((q) => ({ id: q.id, label: q.label, wert: wertFuer(q.tage) })),
    }))
    .filter((a) => mitLeeren || a.wert > 0)
    .sort((a, b) => b.wert - a.wert || a.name.localeCompare(b.name));
  if (!liste.length) return null;
  const eigene = liste.length > maxZeilen ? liste.slice(0, maxZeilen - 1) : liste;
  const rest = liste.slice(eigene.length);
  const max = liste[0].wert;
  const restTeile = SOURCE_ORDER
    .map((id) => ({ id, label: rest.flatMap((a) => a.teile).find((t) => t.id === id)?.label, wert: runde(rest.reduce((x, a) => x + (a.teile.find((t) => t.id === id)?.wert || 0), 0)) }))
    .filter((t) => t.wert > 0);
  return (
    <div className="zs-apps">
      {eigene.map((a) => <AppZeile key={a.key} name={a.name} icon={a.icon} wert={a.wert} teile={a.teile} max={max} cur={cur} />)}
      {rest.length > 0 && (
        <AppZeile name={`Übrige ${rest.length} Apps`} icon={false} zaehler={`+${rest.length}`}
          wert={runde(rest.reduce((x, a) => x + a.wert, 0))} teile={restTeile} max={max} cur={cur} />
      )}
    </div>
  );
}

// Woraus sich der Betrag eines Zeitraums ergibt: erst nach Kanal, dann nach App.
// Beide Blöcke laufen auf dieselbe Summe hinaus; was keiner App zugeordnet ist
// (AdSense sind Webseiten), steht deshalb ausdrücklich als eigene Zeile da.
export default function Zusammensetzung({ s, reihe, tagTitel }) {
  const cur = s.baseCurrency;
  const [art, setArt] = useState('tag');
  const b = bereichFuer(reihe, art);
  if (!b) return null;
  const ZEITRAEUME = [
    { id: 'tag', t: tagTitel },
    { id: 'd7', t: '7 Tage' },
    { id: 'd30', t: '30 Tage' },
    { id: 'monat', t: 'Monat' },
  ];
  const fehlend = art === 'tag' ? new Set(s.lastDayFehlend || []) : new Set();

  const kanaele = SOURCE_ORDER
    .map((id) => s.bySource[id])
    .filter((q) => q?.countsInTotal && q.hasDaily)
    .map((q) => {
      const wert = summeZwischen(reihe, b.von, b.bis, q.id);
      const vorher = b.davor ? summeZwischen(reihe, b.davor[0], b.davor[1], q.id) / b.teiler : null;
      return { id: q.id, name: q.label, wert, vorher, delta: anteil(wert, vorher), fehlt: fehlend.has(q.label) };
    })
    // Ein Kanal, der gerade nichts bringt, vorher aber schon, bleibt stehen - ein Ausfall
    // soll auffallen, nicht stillschweigend aus der Liste verschwinden.
    .filter((k) => k.wert > 0 || k.vorher > 0 || k.fehlt)
    .sort((x, y) => y.wert - x.wert);
  const gesamt = runde(kanaele.reduce((a, k) => a + k.wert, 0));

  const wertFuer = (tage) => summeTage(tage, b.von, b.bis);
  const appSumme = runde((s.apps || []).reduce((a, x) => a + wertFuer(x.tage), 0));
  const ohneApp = runde(gesamt - appSumme);
  const spanne = b.von === b.bis ? fmtDay(b.bis) : `${fmtDay(b.von).slice(0, 6)} – ${fmtDay(b.bis)}`;
  const vergleich = art === 'tag' ? 'ggü. Schnitt der 7 Tage davor' : art === 'monat' ? 'ggü. gleichem Abschnitt des Vormonats' : 'ggü. dem Zeitraum davor';

  return (
    <div className="karte zs">
      <div className="zs-titel">
        <h2>Woraus sich das ergibt</h2>
        <div className="segment" style={{ maxWidth: '100%', overflowX: 'auto' }}>
          {ZEITRAEUME.map((z) => (
            <button key={z.id} className={art === z.id ? 'active' : ''} onClick={() => setArt(z.id)}>{z.t}</button>
          ))}
        </div>
      </div>
      <div className="zs-summe">
        <span>{spanne}</span>
        <b>{fmtMoney(gesamt, cur)}</b>
      </div>

      <div className="zs-block">Nach Kanal</div>
      {gesamt > 0 && (
        <div className="anteil">
          {kanaele.filter((k) => k.wert > 0).map((k) => (
            <div key={k.id} className="anteil-seg" style={{ flexGrow: k.wert, background: farbe(k.id) }} title={`${k.name}: ${fmtMoney(k.wert, cur)}`} />
          ))}
        </div>
      )}
      <div className="zs-kanal-liste">
        {kanaele.map((k) => (
          <div key={k.id} className={`zs-kanal${k.wert > 0 ? '' : ' null'}`}>
            <Punkt farbe={farbe(k.id)} />
            <span className="nm">{k.name}</span>
            {k.fehlt ? (
              <span className="zs-fehlt">noch nicht gemeldet</span>
            ) : (
              <>
                <span className="zs-delta">{k.vorher > 0 && <Delta wert={k.delta} davor={k.vorher} cur={cur} fuss={vergleich} />}</span>
                <i>{gesamt > 0 ? `${Math.round((k.wert / gesamt) * 100)} %` : ''}</i>
                <b>{fmtMoney(k.wert, cur)}</b>
              </>
            )}
          </div>
        ))}
        {!kanaele.length && <p className="hinweis">In diesem Zeitraum hat noch keine Quelle etwas gemeldet.</p>}
      </div>

      {appSumme > 0 && (
        <>
          <div className="zs-block">Nach App</div>
          <AppListe apps={s.apps || []} wertFuer={wertFuer} cur={cur} maxZeilen={MAX_APPS} />
          {ohneApp >= 0.01 && (
            <div className="zs-ohne">
              <span>Ohne App-Zuordnung</span>
              <b>{fmtMoney(ohneApp, cur)}</b>
            </div>
          )}
        </>
      )}

      <p className="hinweis klein" style={{ marginTop: 12 }}>
        Veränderung {vergleich}.
        {ohneApp >= 0.01 && ' „Ohne App-Zuordnung" ist vor allem AdSense: Webseiten, keine Apps.'}
        {s.subsSource === 'revenuecat' && (s.bySource.appstore?.hasDaily || s.bySource.play?.hasDaily)
          && ' App Store und Google Play stehen nicht hier, weil RevenueCat den Abo-Umsatz schon meldet – sonst zählte er doppelt.'}
      </p>
    </div>
  );
}
