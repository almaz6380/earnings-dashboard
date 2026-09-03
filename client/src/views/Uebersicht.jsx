import React from 'react';
import { fmtMoney, fmtDate, fmtDay, fmtMonth, SOURCE_ORDER, SOURCE_COLORS } from '../format.js';

function Kpi({ label, value, cur, hint }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{fmtMoney(value, cur)}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { ok: ['ok', 'aktiv'], error: ['err', 'Fehler'], unconfigured: ['off', 'nicht eingerichtet'] };
  const [cls, text] = map[status] || map.unconfigured;
  return <span className={`badge ${cls}`}>{text}</span>;
}

function SourceCard({ src, cur }) {
  const color = SOURCE_COLORS[src.id];
  return (
    <div className="panel source-card">
      <div className="source-head">
        <span className="dot" style={{ background: color || 'var(--muted)' }} />
        <span className="name">{src.label}</span>
        <StatusBadge status={src.status} />
      </div>
      <div className="hint">{src.art}{src.countsInTotal ? ' · zählt zur Summe' : ''}</div>
      {src.hasDaily && (
        <div className="row3">
          <div><div className="hint">Gestern</div><div className="num">{fmtMoney(src.yesterday, cur)}</div></div>
          <div><div className="hint">30 Tage</div><div className="num">{fmtMoney(src.d30, cur)}</div></div>
          <div><div className="hint">Monat</div><div className="num">{fmtMoney(src.month, cur)}</div></div>
        </div>
      )}
      {src.balances?.map((b, i) => (
        <div key={i} className="balance">
          <span className="hint">{b.label || 'Kontostand'}{b.currency !== cur ? ` · ${fmtMoney(b.amount, b.currency)}` : ''}</span>
          <span className="num">{b.eur != null ? fmtMoney(b.eur, cur) : fmtMoney(b.amount, b.currency)}</span>
        </div>
      ))}
      {src.extra?.mrr != null && (
        <div className="hint">MRR {fmtMoney(src.extra.mrr, src.currency || cur)} · Abos {src.extra.activeSubscriptions ?? '–'} · Trials {src.extra.activeTrials ?? '–'}</div>
      )}
      {src.error && <div className="error">{src.error}</div>}
      {src.asOf && src.status === 'ok' && <div className="hint small">Stand {fmtDate(src.asOf)}</div>}
    </div>
  );
}

export default function Uebersicht({ s }) {
  const cur = s.baseCurrency;
  const k = s.kpis;
  const sources = SOURCE_ORDER.map((id) => s.bySource[id]).filter(Boolean);
  const active = sources.filter((x) => x.status !== 'unconfigured');
  const payouts = s.payouts.slice(0, 8);
  return (
    <>
      <div className="grid kpis">
        <Kpi label="Gestern" value={k.yesterday} cur={cur} />
        <Kpi label="7 Tage" value={k.d7} cur={cur} />
        <Kpi label="30 Tage" value={k.d30} cur={cur} />
        <Kpi label="Dieser Monat" value={k.month} cur={cur} />
        <Kpi label="Letzter Monat" value={k.lastMonth} cur={cur} />
        {(s.accountsEur > 0 || s.openEur > 0) && <Kpi label="Konten + offen" value={(s.accountsEur || 0) + (s.openEur || 0)} cur={cur} hint="Wise/PayPal + offenes AdSense-Guthaben" />}
      </div>
      <p className="hint">
        Summe = Werbung (AdMob, AdSense) + Abo-Umsatz {s.subsSource === 'revenuecat' ? 'laut RevenueCat (vor Store-Abzug)' : 'laut Store-Erlösen (App Store Sales + Play)'}. Schätzwerte, umgerechnet mit EZB-Kursen.
        {s.unconverted?.length ? ` Nicht umrechenbar: ${s.unconverted.join(', ')}.` : ''}
        {s.fxError ? ` Wechselkurse gerade nicht erreichbar (${s.fxError}).` : ''}
      </p>

      {!active.length && (
        <div className="panel">
          <h2>Noch keine Quelle eingerichtet</h2>
          <p className="hint">Im Tab „Quellen" steht, welche Variablen fehlen. Danach „Aktualisieren" tippen.</p>
        </div>
      )}
      <div className="grid cols3">
        {active.map((src) => <SourceCard key={src.id} src={src} cur={cur} />)}
      </div>

      {payouts.length > 0 && (
        <div className="panel">
          <h2>Tatsächliche Auszahlungen</h2>
          <table>
            <thead><tr><th>Monat</th><th>Quelle</th><th>Betrag</th><th>in {cur}</th></tr></thead>
            <tbody>
              {payouts.map((p, i) => (
                <tr key={i}>
                  <td>{fmtMonth(p.month)}</td>
                  <td>{p.label}</td>
                  <td>{fmtMoney(p.amount, p.currency)}</td>
                  <td>{p.eur != null ? fmtMoney(p.eur, cur) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint small">Apple rechnet in Fiskalmonaten ab, Google Play in Kalendermonaten.</p>
        </div>
      )}
      {s.series?.length > 0 && (
        <p className="hint small">Letzter Tag mit Daten: {fmtDay([...s.series].reverse().find((r) => r.total > 0)?.date)}</p>
      )}
    </>
  );
}
