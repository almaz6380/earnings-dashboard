import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { fmtMoney, SOURCE_COLORS } from '../format.js';

const RANGES = [
  { id: 'd7', label: '7 Tage' },
  { id: 'd30', label: '30 Tage' },
  { id: 'month', label: 'Monat' },
];

function TT({ active, payload, cur }) {
  if (!active || !payload?.length) return null;
  const a = payload[0].payload;
  return (
    <div className="tooltip">
      <div className="tt-title">{a.name}</div>
      {a.sources.map((q) => (
        <div className="tt-row" key={q.id}><span className="dot" style={{ background: SOURCE_COLORS[q.id] || 'var(--muted)' }} />{q.label}<span className="tt-val">{fmtMoney(q.d30, cur)}</span></div>
      ))}
      <div className="tt-row total">30 Tage<span className="tt-val">{fmtMoney(a.d30, cur)}</span></div>
    </div>
  );
}

export default function Apps({ s }) {
  const cur = s.baseCurrency;
  const apps = s.apps || [];
  const [range, setRange] = useState('d30');
  const top = useMemo(() => [...apps].sort((a, b) => b[range] - a[range]).slice(0, 10), [apps, range]);

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
        <h2>Größte Apps · {RANGES.find((r) => r.id === range).label}</h2>
        <ResponsiveContainer width="100%" height={Math.max(160, top.length * 34 + 30)}>
          <BarChart data={top} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" stroke="var(--muted)" tick={{ fontSize: 11 }} tickFormatter={(v) => fmtMoney(v, cur, 0)} />
            <YAxis type="category" dataKey="name" stroke="var(--muted)" tick={{ fontSize: 11 }} width={110} />
            <Tooltip content={<TT cur={cur} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar dataKey={range} radius={[0, 3, 3, 0]}>
              {top.map((a) => <Cell key={a.key} fill={SOURCE_COLORS[a.sources[0]?.id] || '#3987e5'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2>Alle Apps</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>App</th><th>gestern</th><th>7 Tage</th><th>30 Tage</th><th>Monat</th></tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.key}>
                  <td>
                    <div>{a.name}</div>
                    <div className="hint small nowrap">
                      {a.sources.map((q) => (
                        <span key={q.id} title={`${q.label}: ${fmtMoney(q.d30, cur)} in 30 Tagen`}>
                          <span className="dot" style={{ background: SOURCE_COLORS[q.id] || 'var(--muted)' }} />{q.label}{' '}
                        </span>
                      ))}
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
      <p className="hint small">Gezählt werden nur die Quellen, die auch in die Gesamtsumme gehen – so wird nichts doppelt gezählt. Gleiche App-Namen aus verschiedenen Quellen (z. B. Werbung und Abos) stehen in einer Zeile. AdSense bleibt außen vor: das sind Webseiten, keine Apps.</p>
    </>
  );
}
