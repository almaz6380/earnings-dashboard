import React, { useMemo, useState } from 'react';
import { fmtMoney, fmtDay, SOURCE_ORDER } from '../format.js';
import { StapelBalken, Legende, farbe } from '../charts.jsx';
import { Punkt, Leer } from '../components.jsx';
import AppIcon from '../AppIcon.jsx';

const ZEITRAEUME = [
  { id: 'heute', t: 'Heute' },
  { id: 'gestern', t: 'Gestern' },
  { id: 'woche', t: 'Woche' },
  { id: 'monat', t: 'Monat' },
  { id: 'individuell', t: 'Individuell' },
];

// Tage als YYYY-MM-DD in UTC, wie der Server sie schreibt - sonst verschöbe die
// Zeitzone des Telefons jeden Zeitraum um einen Tag.
const tagPlus = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Woche = seit Montag, Monat = seit dem Ersten, jeweils bis heute.
function spanne(id, heute, von, bis) {
  if (id === 'heute') return [heute, heute];
  if (id === 'gestern') { const g = tagPlus(heute, -1); return [g, g]; }
  if (id === 'woche') { const wt = (new Date(`${heute}T00:00:00Z`).getUTCDay() + 6) % 7; return [tagPlus(heute, -wt), heute]; }
  if (id === 'monat') return [`${heute.slice(0, 7)}-01`, heute];
  return von <= bis ? [von, bis] : [bis, von];
}

const summeIn = (tage, [von, bis]) => Math.round(
  Object.entries(tage || {}).reduce((a, [d, v]) => (d >= von && d <= bis ? a + v : a), 0) * 100,
) / 100;
// Quellen, die überhaupt je App aufschlüsseln können (AdSense sind Webseiten, keine Apps).
const APP_QUELLEN = ['admob', 'revenuecat', 'appstore', 'play'];

export default function Apps({ s }) {
  const cur = s.baseCurrency;
  const apps = s.apps || [];
  const heute = s.todayDate || new Date().toISOString().slice(0, 10);
  // Heute zuerst: die Frage beim Öffnen ist meist, welche App heute wie viel bringt.
  const [zeitraum, setZeitraum] = useState('heute');
  const [von, setVon] = useState(() => tagPlus(heute, -29));
  const [bis, setBis] = useState(heute);
  const [tabelle, setTabelle] = useState(false);
  const bereich = spanne(zeitraum, heute, von, bis);
  const labelZeitraum = bereich[0] === bereich[1]
    ? fmtDay(bereich[0])
    : `${fmtDay(bereich[0]).slice(0, 6)} – ${fmtDay(bereich[1])}`;

  // Je App und Quelle der Betrag im gewählten Zeitraum, aus den Tageswerten gerechnet.
  const liste = useMemo(() => apps.map((a) => ({
    ...a,
    wert: summeIn(a.tage, bereich),
    quellen: a.sources.map((q) => ({ ...q, wert: summeIn(q.tage, bereich) })),
  })).sort((a, b) => b.wert - a.wert || a.name.localeCompare(b.name)), [apps, bereich[0], bereich[1]]);
  const gesamt = Math.round(liste.reduce((x, a) => x + a.wert, 0) * 100) / 100;

  const top = liste.filter((a) => a.wert > 0).slice(0, 10);
  // Eine Zeile je App, ein Feld je Quelle - so zeigt der Balken auch die Zusammensetzung.
  const zeilen = top.map((a) => {
    const z = { name: a.name, __summe: a.wert };
    for (const q of a.quellen) z[q.id] = q.wert || 0;
    return z;
  });
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
        {/* Fünf Reiter passen auf schmalen Telefonen knapp nicht - dann wird gewischt statt umgebrochen. */}
        <div className="segment" style={{ maxWidth: '100%', overflowX: 'auto' }}>
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
      {zeitraum === 'individuell' && (
        <div className="filter">
          <label className="hinweis klein" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            von <input type="date" value={von} max={heute} onChange={(e) => e.target.value && setVon(e.target.value)} />
          </label>
          <label className="hinweis klein" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            bis <input type="date" value={bis} max={heute} onChange={(e) => e.target.value && setBis(e.target.value)} />
          </label>
        </div>
      )}

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
        <h2>Alle Apps · {labelZeitraum}</h2>
        <div className="rollen">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th className="zahl nowrap">{ZEITRAEUME.find((z) => z.id === zeitraum).t}</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((a) => (
                <tr key={a.key}>
                  <td>
                    <div className="appzeile">
                      <AppIcon src={a.icon} name={a.name} color={farbe(a.sources[0]?.id)} size={32} />
                      <div style={{ minWidth: 0 }}>
                        <div>{a.name}</div>
                        <div className="hinweis klein nowrap" style={{ display: 'flex', gap: 9, marginTop: 1 }}>
                          {a.quellen.map((q) => (
                            <span key={q.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              title={`${q.label}: ${fmtMoney(q.wert, cur)} · ${labelZeitraum}`}>
                              <Punkt farbe={farbe(q.id)} />{q.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="zahl" style={a.wert ? undefined : { color: 'var(--ink3)' }}><b>{fmtMoney(a.wert, cur)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Summe</b></td>
                <td className="zahl"><b>{fmtMoney(gesamt, cur)}</b></td>
              </tr>
            </tfoot>
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
        Woche heißt seit Montag, Monat seit dem Ersten. AdMob meldet mit 1–2 Tagen Verzug, deshalb stehen bei „Heute“ und „Gestern“ oft noch kleine oder gar keine Beträge.
      </p>
    </>
  );
}
