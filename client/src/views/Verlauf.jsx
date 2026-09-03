import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fmtMoney, fmtDay, fmtMonth, SOURCE_COLORS } from '../format.js';

const ORDER = ['admob', 'adsense', 'revenuecat', 'appstore', 'play'];

function TT({ active, payload, label, cur, fmtLabel }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (p.value || 0), 0);
  return (
    <div className="tooltip">
      <div className="tt-title">{fmtLabel(label)}</div>
      {payload.filter((p) => p.value).map((p) => (
        <div key={p.dataKey} className="tt-row"><span className="dot" style={{ background: p.color }} />{p.name}<span className="tt-val">{fmtMoney(p.value, cur)}</span></div>
      ))}
      <div className="tt-row total">Summe<span className="tt-val">{fmtMoney(total, cur)}</span></div>
    </div>
  );
}

function Chart({ data, xKey, ids, labels, cur, fmtLabel }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey={xKey} tickFormatter={fmtLabel} stroke="var(--muted)" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} width={56} tickFormatter={(v) => fmtMoney(v, cur, 0)} />
        <Tooltip content={<TT cur={cur} fmtLabel={fmtLabel} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {ids.map((id) => (
          <Bar key={id} dataKey={id} name={labels[id]} stackId="a" fill={SOURCE_COLORS[id]} stroke="var(--panel)" strokeWidth={1} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function Table({ data, xKey, ids, labels, cur, fmtLabel }) {
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>{xKey === 'date' ? 'Tag' : 'Monat'}</th>{ids.map((id) => <th key={id}>{labels[id]}</th>)}<th>Summe</th></tr></thead>
        <tbody>
          {[...data].reverse().map((r) => (
            <tr key={r[xKey]}><td>{fmtLabel(r[xKey])}</td>{ids.map((id) => <td key={id}>{fmtMoney(r[id], cur)}</td>)}<td><b>{fmtMoney(r.total, cur)}</b></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Verlauf({ s }) {
  const cur = s.baseCurrency;
  const [range, setRange] = useState(30);
  const [asTable, setAsTable] = useState(false);
  const labels = Object.fromEntries(Object.values(s.bySource).map((x) => [x.id, x.label]));
  const ids = ORDER.filter((id) => s.bySource[id]?.hasDaily);
  const daily = useMemo(() => s.series.slice(-range), [s.series, range]);
  if (!ids.length) return <div className="panel"><p className="hint">Noch keine Tageswerte. Erst Quellen einrichten und „Aktualisieren" tippen.</p></div>;
  const View = asTable ? Table : Chart;
  return (
    <>
      <div className="toolbar">
        {[30, 90].map((n) => <button key={n} className={`btn small ${range === n ? 'active' : ''}`} onClick={() => setRange(n)}>{n} Tage</button>)}
        <span className="spacer" />
        <button className={`btn small ${asTable ? 'active' : ''}`} onClick={() => setAsTable(!asTable)}>{asTable ? 'Diagramm' : 'Tabelle'}</button>
      </div>
      <div className="panel">
        <h2>Pro Tag</h2>
        <View data={daily} xKey="date" ids={ids} labels={labels} cur={cur} fmtLabel={(d) => fmtDay(d).slice(0, 6)} />
      </div>
      <div className="panel">
        <h2>Pro Monat</h2>
        <View data={s.monthly} xKey="month" ids={ids} labels={labels} cur={cur} fmtLabel={fmtMonth} />
      </div>
      <p className="hint small">Gestapelt pro Quelle. Nur Quellen mit Tageswerten. In die Summe zählen: {ids.filter((id) => s.bySource[id].countsInTotal).map((id) => labels[id]).join(', ')}.</p>
    </>
  );
}
