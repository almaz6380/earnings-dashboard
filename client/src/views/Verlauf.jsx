import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtDay, fmtMonth, SOURCE_ORDER } from '../format.js';
import { StapelSaeulen, Legende } from '../charts.jsx';
import { Leer } from '../components.jsx';

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
  const labels = Object.fromEntries(Object.values(s.bySource).map((x) => [x.id, x.label]));
  // Reihenfolge = Reihenfolge der Palette. Sie bestimmt, welche Farben im Stapel
  // aneinanderstoßen, und darf deshalb nicht nach Größe sortiert werden.
  const ids = SOURCE_ORDER.filter((id) => s.bySource[id]?.hasDaily);
  const tagesdaten = useMemo(() => s.series.slice(-tage), [s.series, tage]);
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
        <h2>Pro Tag</h2>
        <Legende ids={ids} labels={labels} />
        {tabelle
          ? <Tabelle daten={tagesdaten} xKey="date" ids={ids} labels={labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} />
          : <div className="chart"><StapelSaeulen daten={tagesdaten} xKey="date" ids={ids} labels={labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} hoehe={250} /></div>}
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
