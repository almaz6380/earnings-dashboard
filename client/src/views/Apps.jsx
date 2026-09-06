import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { fmtMoney, SOURCE_COLORS } from '../format.js';
import AppIcon from '../AppIcon.jsx';

const RANGES = [
  { id: 'd7', label: '7 Tage' },
  { id: 'd30', label: '30 Tage' },
  { id: 'month', label: 'Monat' },
];

// Quellen, die überhaupt eine App-Aufschlüsselung liefern können (AdSense sind Webseiten).
const APP_QUELLEN = ['admob', 'revenuecat', 'appstore', 'play'];

// Bei kleinen Beträgen zwei Nachkommastellen, sonst stehen an der Achse
// mehrere Striche mit demselben Text ("1 €, 1 €").
const stellen = (max) => (max < 10 ? 2 : 0);
// Nur wirklich lange Namen kürzen; kürzere darf recharts über zwei Zeilen umbrechen.
const kurz = (name) => (name.length > 28 ? `${name.slice(0, 27)}…` : name);

function TT({ active, payload, cur, range, rangeLabel }) {
  if (!active || !payload?.length) return null;
  const a = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tt-title">{a.name}</div>
      {a.sources.map((q) => (
        <div className="tt-row" key={q.id}><span className="dot" style={{ background: SOURCE_COLORS[q.id] || 'var(--muted)' }} />{q.label}<span className="tt-val">{fmtMoney(q[range], cur)}</span></div>
      ))}
      <div className="tt-row total">{rangeLabel}<span className="tt-val">{fmtMoney(a[range], cur)}</span></div>
    </div>
  );
}

export default function Apps({ s }) {
  const cur = s.baseCurrency;
  const apps = s.apps || [];
  const [range, setRange] = useState('d30');
  const rangeLabel = RANGES.find((r) => r.id === range).label;
  // Nur Apps mit einem Betrag im gewählten Zeitraum – Nullbalken sind unsichtbar
  // und würden das Diagramm nur in die Länge ziehen. In der Tabelle bleiben sie.
  const top = useMemo(() => apps.filter((a) => a[range] > 0).sort((a, b) => b[range] - a[range]).slice(0, 10), [apps, range]);
  const maxWert = top.length ? top[0][range] : 0;
  // Eine verbundene Quelle, die keine einzige App beisteuert, sieht sonst aus wie ein Fehler.
  const genannt = new Set(apps.flatMap((a) => a.sources.map((q) => q.id)));
  const stumm = APP_QUELLEN.filter((id) => s.bySource[id]?.status === 'ok' && !genannt.has(id)).map((id) => s.bySource[id].label);

  if (!apps.length) {
    return (
      <div className="panel">
        <h2>Nach Apps</h2>
        <p className="hint">Noch keine App-Werte. Die Aufschlüsselung kommt von AdMob (je App), RevenueCat (je Projekt) sowie – sobald verbunden – App Store Connect und Google Play. Nach dem nächsten „Aktualisieren" steht sie hier.</p>
      </div>
    );
  }

  return (
    <>
      <div className="toolbar">
        {RANGES.map((r) => (
          <button key={r.id} className={`btn small ${range === r.id ? 'active' : ''}`} onClick={() => setRange(r.id)}>{r.label}</button>
        ))}
      </div>

      <div className="panel">
        <h2>Größte Apps · {rangeLabel}</h2>
        {top.length ? (
          <ResponsiveContainer width="100%" height={Math.max(160, top.length * 34 + 30)}>
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" stroke="var(--muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v, cur, stellen(maxWert))} />
              <YAxis type="category" dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} width={140} tickFormatter={kurz} />
              <Tooltip content={<TT cur={cur} range={range} rangeLabel={rangeLabel} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey={range} radius={[0, 3, 3, 0]}>
                {top.map((a) => <Cell key={a.key} fill={SOURCE_COLORS[a.sources[0]?.id] || '#3987e5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="hint">In diesem Zeitraum hat noch keine App etwas eingebracht.</p>}
      </div>

      <div className="panel">
        <h2>Alle Apps</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>App</th><th className="nowrap">gestern</th><th className="nowrap">7 Tage</th><th className="nowrap">30 Tage</th><th className="nowrap">Monat</th></tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.key}>
                  <td>
                    <div className="appzeile">
                      <AppIcon src={a.icon} name={a.name} color={SOURCE_COLORS[a.sources[0]?.id]} size={32} />
                      <div>
                        <div>{a.name}</div>
                        <div className="hint small nowrap">
                          {a.sources.map((q) => (
                          <span key={q.id} title={`${q.label}: ${fmtMoney(q[range], cur)} · ${rangeLabel}`}>
                            <span className="dot" style={{ background: SOURCE_COLORS[q.id] || 'var(--muted)' }} />{q.label}{' '}
                          </span>
                        ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{fmtMoney(a.yesterday, cur)}</td>
                  <td>{fmtMoney(a.d7, cur)}</td>
                  <td><b>{fmtMoney(a.d30, cur)}</b></td>
                  <td>{fmtMoney(a.month, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {stumm.length > 0 && (
        <p className="hint small">Verbunden, aber ohne App-Werte: {stumm.join(', ')}. Diese Quelle meldet zurzeit keine Einnahmen – bei RevenueCat heißt das: keine laufenden Abos.</p>
      )}
      <p className="hint small">Gezählt werden nur die Quellen, die auch in die Gesamtsumme gehen – so wird nichts doppelt gezählt. Gleiche App-Namen aus verschiedenen Quellen (z. B. Werbung und Abos) stehen in einer Zeile. AdSense bleibt außen vor: das sind Webseiten, keine Apps. AdMob meldet mit 1–2 Tagen Verzug, deshalb steht bei „gestern" meist noch 0 €.</p>
    </>
  );
}
