import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtDay, fmtMonth, SOURCE_ORDER } from '../format.js';
import { StapelSaeulen, Legende } from '../charts.jsx';
import { Leer } from '../components.jsx';
import { APP_FARBEN, APP_REST } from '../theme.js';

// Mehr Apps als Farben trennt das Auge im Stapel nicht; der Rest wird zusammengefasst.
const MAX_APPS = APP_FARBEN.length;
const REST = '__uebrige';

const ZEITRAEUME = [{ n: 7, t: '7 Tage' }, { n: 30, t: '30 Tage' }, { n: 90, t: '90 Tage' }];

function Tabelle({ daten, xKey, ids, labels, cur, fmtLabel }) {
  return (
    <div className="rollen">
      <table>
        <thead>
          <tr>
            <th>{xKey === 'date' ? 'Tag' : 'Monat'}</th>
            {ids.map((id) => <th key={id} className="zahl">{labels[id]}</th>)}
            <th className="zahl">Summe</th>
          </tr>
        </thead>
        <tbody>
          {[...daten].reverse().map((r) => (
            <tr key={r[xKey]}>
              <td>{fmtLabel(r[xKey])}</td>
              {ids.map((id) => <td key={id} className="zahl">{fmtMoney(r[id], cur)}</td>)}
              <td className="zahl"><b>{fmtMoney(r.total, cur)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Verlauf({ s }) {
  const cur = s.baseCurrency;
  const [tage, setTage] = useState(30);
  const [tabelle, setTabelle] = useState(false);
  const [nachApp, setNachApp] = useState(false);
  const labels = Object.fromEntries(Object.values(s.bySource).map((x) => [x.id, x.label]));
  // Reihenfolge = Reihenfolge der Palette. Sie bestimmt, welche Farben im Stapel
  // aneinanderstoßen, und darf deshalb nicht nach Größe sortiert werden.
  const ids = SOURCE_ORDER.filter((id) => s.bySource[id]?.hasDaily);
  const tagesdaten = useMemo(() => s.series.slice(-tage), [s.series, tage]);
  // Je Tag, welche App wie viel beigetragen hat. Die größten Apps des gewählten Zeitraums
  // bekommen eine eigene Farbe, alle übrigen einen gemeinsamen grauen Block.
  const appAnsicht = useMemo(() => {
    const reihe = (s.appSeries || []).slice(-tage);
    const summen = new Map();
    for (const r of reihe) for (const [k, v] of Object.entries(r)) if (k !== 'date') summen.set(k, (summen.get(k) || 0) + v);
    const sortiert = [...summen.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const eigene = sortiert.length > MAX_APPS ? sortiert.slice(0, MAX_APPS - 1) : sortiert;
    const rest = sortiert.slice(eigene.length);
    const namen = Object.fromEntries((s.apps || []).map((a) => [a.key, a.name]));
    const appIds = [...eigene, ...(rest.length ? [REST] : [])];
    const appLabels = { ...Object.fromEntries(eigene.map((k) => [k, namen[k] || k])), [REST]: `Übrige (${rest.length})` };
    const farben = { ...Object.fromEntries(eigene.map((k, i) => [k, APP_FARBEN[i]])), [REST]: APP_REST };
    const daten = reihe.map((r) => {
      const z = { date: r.date };
      let total = 0;
      for (const k of eigene) { z[k] = r[k] || 0; total += z[k]; }
      if (rest.length) { z[REST] = Math.round(rest.reduce((a, k) => a + (r[k] || 0), 0) * 100) / 100; total += z[REST]; }
      z.total = Math.round(total * 100) / 100;
      return z;
    });
    return { ids: appIds, labels: appLabels, farben, daten };
  }, [s.appSeries, s.apps, tage]);
  const hatApps = appAnsicht.ids.length > 0;
  const zeigeApps = nachApp && hatApps;

  const monatsdaten = useMemo(() => s.monthly.filter((m) => ids.some((id) => m[id]) || m.total), [s.monthly, ids]);

  if (!ids.length) {
    return <Leer titel="Noch keine Tageswerte" text="Sobald eine Quelle Tageswerte liefert, wächst hier der Verlauf – bis zu zwei Jahre zurück." />;
  }

  const zaehlen = ids.filter((id) => s.bySource[id].countsInTotal).map((id) => labels[id]);

  return (
    <>
      {/* Eine Filterzeile über allem, was sie einschränkt. */}
      <div className="filter">
        <div className="segment">
          {ZEITRAEUME.map((z) => (
            <button key={z.n} className={tage === z.n ? 'active' : ''} onClick={() => setTage(z.n)}>{z.t}</button>
          ))}
        </div>
        <span className="luecke" />
        <div className="segment">
          <button className={!tabelle ? 'active' : ''} onClick={() => setTabelle(false)}>Diagramm</button>
          <button className={tabelle ? 'active' : ''} onClick={() => setTabelle(true)}>Tabelle</button>
        </div>
      </div>

      <div className="karte">
        {/* Überschrift und Umschalter in einer Zeile; .abschnitt trägt den Stil von .karte > h2. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 className="abschnitt" style={{ margin: 0 }}>Pro Tag</h2>
          <span className="luecke" style={{ flex: 1 }} />
          {hatApps && (
            <div className="segment">
              <button className={!nachApp ? 'active' : ''} onClick={() => setNachApp(false)}>Nach Quelle</button>
              <button className={nachApp ? 'active' : ''} onClick={() => setNachApp(true)}>Nach App</button>
            </div>
          )}
        </div>
        {zeigeApps ? (
          <>
            <Legende ids={appAnsicht.ids} labels={appAnsicht.labels} farben={appAnsicht.farben} />
            {tabelle
              ? <Tabelle daten={appAnsicht.daten} xKey="date" ids={appAnsicht.ids} labels={appAnsicht.labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} />
              : <div className="chart"><StapelSaeulen daten={appAnsicht.daten} xKey="date" ids={appAnsicht.ids} labels={appAnsicht.labels} farben={appAnsicht.farben} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} hoehe={250} /></div>}
            <p className="hinweis klein" style={{ marginTop: 8 }}>
              Tippe auf einen Tag für die Aufteilung. Nur Einnahmen, die einer App zugeordnet sind (AdMob je App, RevenueCat je Projekt, Stores) – AdSense fehlt hier.
            </p>
          </>
        ) : (
          <>
            <Legende ids={ids} labels={labels} />
            {tabelle
              ? <Tabelle daten={tagesdaten} xKey="date" ids={ids} labels={labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} />
              : <div className="chart"><StapelSaeulen daten={tagesdaten} xKey="date" ids={ids} labels={labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} hoehe={250} /></div>}
          </>
        )}
      </div>

      <div className="karte">
        <h2>Pro Monat</h2>
        <Legende ids={ids} labels={labels} />
        {tabelle
          ? <Tabelle daten={monatsdaten} xKey="month" ids={ids} labels={labels} cur={cur} fmtLabel={fmtMonth} />
          : <div className="chart"><StapelSaeulen daten={monatsdaten} xKey="month" ids={ids} labels={labels} cur={cur} fmtLabel={(m) => fmtMonth(m).replace(' ', ' ')} hoehe={230} /></div>}
      </div>

      <p className="hinweis klein">
        Gestapelt nach Quelle. In die Summe zählen: {zaehlen.join(', ')}. Quellen ohne Tageswerte (Kontostände) bleiben außen vor.
      </p>
    </>
  );
}
