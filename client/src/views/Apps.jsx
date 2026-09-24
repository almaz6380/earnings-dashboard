import React, { useMemo, useState } from 'react';
import { fmtMoney, SOURCE_ORDER } from '../format.js';
import { StapelBalken, Legende, farbe } from '../charts.jsx';
import { Punkt, Leer } from '../components.jsx';
import AppIcon from '../AppIcon.jsx';

const ZEITRAEUME = [{ id: 'd7', t: '7 Tage' }, { id: 'd30', t: '30 Tage' }, { id: 'month', t: 'Monat' }];
// Quellen, die überhaupt je App aufschlüsseln können (AdSense sind Webseiten, keine Apps).
const APP_QUELLEN = ['admob', 'revenuecat', 'appstore', 'play'];

export default function Apps({ s }) {
  const cur = s.baseCurrency;
  const apps = s.apps || [];
  const [zeitraum, setZeitraum] = useState('d30');
  const [tabelle, setTabelle] = useState(false);
  const labelZeitraum = ZEITRAEUME.find((z) => z.id === zeitraum).t;

  const top = useMemo(
    () => apps.filter((a) => a[zeitraum] > 0).sort((a, b) => b[zeitraum] - a[zeitraum]).slice(0, 10),
    [apps, zeitraum],
  );
  // Eine Zeile je App, ein Feld je Quelle - so zeigt der Balken auch die Zusammensetzung.
  const zeilen = useMemo(() => top.map((a) => {
    const z = { name: a.name, __summe: a[zeitraum] };
    for (const q of a.sources) z[q.id] = q[zeitraum] || 0;
    return z;
  }), [top, zeitraum]);
  const ids = SOURCE_ORDER.filter((id) => zeilen.some((z) => z[id] > 0));
  const labels = Object.fromEntries(Object.values(s.bySource).map((x) => [x.id, x.label]));

  // Zwei verschiedene Gründe, warum eine verbundene Quelle hier fehlt - sie
  // in einen Satz zu werfen, behauptete etwas Falsches über die zweite Gruppe.
  const genannt = new Set(apps.flatMap((a) => a.sources.map((q) => q.id)));
  const offen = APP_QUELLEN.filter((id) => s.bySource[id]?.status === 'ok' && !genannt.has(id));
  const stumm = offen.filter((id) => s.bySource[id].countsInTotal).map((id) => s.bySource[id].label);
  const nichtGezaehlt = offen.filter((id) => !s.bySource[id].countsInTotal).map((id) => s.bySource[id].label);

  if (!apps.length) {
    return (
      <Leer
        titel="Noch keine App-Werte"
        text="Die Aufschlüsselung kommt von AdMob (je App), RevenueCat (je Projekt), App Store Connect und Google Play. Nach dem nächsten Abruf steht sie hier."
      />
    );
  }

  return (
    <>
      <div className="filter">
        <div className="segment">
          {ZEITRAEUME.map((z) => (
            <button key={z.id} className={zeitraum === z.id ? 'active' : ''} onClick={() => setZeitraum(z.id)}>{z.t}</button>
          ))}
        </div>
        <span className="luecke" />
        <div className="segment">
          <button className={!tabelle ? 'active' : ''} onClick={() => setTabelle(false)}>Diagramm</button>
          <button className={tabelle ? 'active' : ''} onClick={() => setTabelle(true)}>Tabelle</button>
        </div>
      </div>

      {!tabelle && (
        <div className="karte">
          <h2>Größte Apps · {labelZeitraum}</h2>
          {zeilen.length ? (
            <>
              <Legende ids={ids} labels={labels} />
              <div className="chart">
                <StapelBalken daten={zeilen} ids={ids} labels={labels} cur={cur} hoehe={Math.max(150, zeilen.length * 38 + 34)} />
              </div>
            </>
          ) : <p className="hinweis">In diesem Zeitraum hat noch keine App etwas eingebracht.</p>}
        </div>
      )}

      <div className="karte">
        <h2>Alle Apps</h2>
        <div className="rollen">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th className="zahl nowrap nur-breit">gestern</th>
                <th className="zahl nowrap nur-breit">7 Tage</th>
                <th className="zahl nowrap">30 Tage</th>
                <th className="zahl nowrap nur-breit">Monat</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.key}>
                  <td>
                    <div className="appzeile">
                      <AppIcon src={a.icon} name={a.name} color={farbe(a.sources[0]?.id)} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div>{a.name}</div>
                        <div className="hinweis klein nowrap" style={{ display: 'flex', gap: 9, marginTop: 1 }}>
                          {a.sources.map((q) => (
                            <span key={q.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title={`${q.label}: ${fmtMoney(q[zeitraum], cur)} · ${labelZeitraum}`}>
                              <Punkt farbe={farbe(q.id)} />{q.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="zahl nur-breit">{fmtMoney(a.yesterday, cur)}</td>
                  <td className="zahl nur-breit">{fmtMoney(a.d7, cur)}</td>
                  <td className="zahl"><b>{fmtMoney(a.d30, cur)}</b></td>
                  <td className="zahl nur-breit">{fmtMoney(a.month, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stumm.length > 0 && (
        <p className="hinweis klein">Verbunden, meldet aber zurzeit keine Einnahmen: {stumm.join(', ')}. Bei RevenueCat heißt das: keine laufenden Abos.</p>
      )}
      {nichtGezaehlt.length > 0 && (
        <p className="hinweis klein">{nichtGezaehlt.join(' und ')} {nichtGezaehlt.length > 1 ? 'stehen' : 'steht'} hier nicht, weil RevenueCat den Abo-Umsatz schon meldet – sonst zählte er doppelt.</p>
      )}
      <p className="hinweis klein">
        Gezählt wird nur, was auch in die Gesamtsumme geht, damit nichts doppelt erscheint. Jede Plattform steht in einer eigenen Zeile. Gleiche App-Namen aus verschiedenen Quellen werden je Plattform zusammengeführt, ein Untertitel nach Doppelpunkt zählt dabei nicht mit.
        AdMob meldet mit 1–2 Tagen Verzug, deshalb steht bei „gestern“ oft noch nichts.
      </p>
    </>
  );
}
