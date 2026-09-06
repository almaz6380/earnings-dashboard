import React from 'react';
import { fmtMoney, fmtZahl, fmtDay, fmtMonth, SOURCE_ORDER, SOURCE_COLORS } from '../format.js';

// Auf Amber ist dunkle Schrift lesbar, auf den anderen Quellenfarben weiße.
const DUNKLE_SCHRIFT = new Set(['appstore']);

function summe(list) {
  return list.filter((b) => b.eur != null).reduce((a, b) => a + b.eur, 0);
}

// Was auf der farbigen Karte steht: eine Statuszeile, ein Betrag, ein Label.
function karte(src, s) {
  const cur = s.baseCurrency;
  if (src.status === 'error') {
    return { wait: true, sub: 'Fehler', text: (src.error || 'Abruf fehlgeschlagen').slice(0, 70) };
  }
  switch (src.id) {
    case 'admob': {
      const n = (s.apps || []).filter((a) => a.sources.some((q) => q.id === 'admob')).length;
      return { sub: n ? `aktiv · ${n} Apps` : 'aktiv', amount: fmtMoney(src.d30, cur), label: '30 Tage' };
    }
    case 'adsense': {
      const offen = src.balances?.length ? summe(src.balances) : null;
      return offen != null
        ? { sub: 'aktiv · Web', amount: fmtMoney(offen, cur), label: 'offenes Guthaben' }
        : { sub: 'aktiv · Web', amount: fmtMoney(src.d30, cur), label: '30 Tage' };
    }
    case 'revenuecat': {
      const abos = src.extra?.activeSubscriptions ?? 0;
      const projekte = src.extra?.projects?.length || 1;
      return { sub: `${abos} Abos · ${projekte} ${projekte === 1 ? 'Projekt' : 'Projekte'}`, amount: fmtMoney(src.d30, cur), label: '30 Tage' };
    }
    case 'wise':
    case 'paypal':
      return { sub: 'Kontostand', amount: fmtMoney(summe(src.balances || []), cur), label: 'aktuell' };
    default:
      if (!src.hasDaily) return { wait: true, sub: 'verbunden', text: 'wartet auf ersten Verkauf' };
      return { sub: 'aktiv', amount: fmtMoney(src.d30, cur), label: '30 Tage' };
  }
}

function Tile({ src, s }) {
  const k = karte(src, s);
  const farbe = SOURCE_COLORS[src.id];
  const style = { '--tile': farbe || 'var(--panel2)', '--ink': DUNKLE_SCHRIFT.has(src.id) ? '#1a1300' : '#ffffff' };
  if (k.wait) {
    return (
      <div className="tile wait" style={style}>
        <div>
          <div className="name" style={{ color: src.status === 'error' ? 'var(--red)' : farbe }}>{src.label}</div>
          <div className="sub">{k.sub}</div>
        </div>
        <div className="amt">{k.text}</div>
      </div>
    );
  }
  return (
    <div className="tile" style={style}>
      <div>
        <div className="name">{src.label}</div>
        <div className="sub">{k.sub}</div>
      </div>
      <div>
        <div className="amt">{k.amount}</div>
        <div className="lbl">{k.label}</div>
      </div>
    </div>
  );
}

export default function Uebersicht({ s }) {
  const cur = s.baseCurrency;
  const k = s.kpis;
  const sources = SOURCE_ORDER.map((id) => s.bySource[id]).filter(Boolean);
  const active = sources.filter((x) => x.status !== 'unconfigured');
  const top = [...(s.apps || [])].filter((a) => a.d30 > 0).sort((a, b) => b.d30 - a.d30).slice(0, 3);
  const max = top[0]?.d30 || 1;
  const payouts = s.payouts.slice(0, 6);
  const letzterTagTitle = s.lastDayFehlend?.length ? `Ohne ${s.lastDayFehlend.join(', ')} – noch keine Meldung für diesen Tag` : undefined;

  return (
    <>
      <div className="hero">
        <div className="hero-top">
          <div title={letzterTagTitle}>
            <div className="hero-label">{s.lastDayDate ? `Letzter Tag · ${fmtDay(s.lastDayDate).slice(0, 6)}` : 'Letzter Tag'}</div>
            <div className="hero-value">{s.lastDayDate ? fmtMoney(k.lastDay, cur) : '–'}</div>
            {s.lastDayFehlend?.length > 0 && <div className="hint small" style={{ marginTop: 6 }}>ohne {s.lastDayFehlend.join(', ')} – noch keine Meldung</div>}
          </div>
          <div className="hero-side">
            <div className="lbl">30 Tage</div>
            <div className="val">{fmtMoney(k.d30, cur)}</div>
          </div>
        </div>
        <div className="mini">
          <div>
            <div className="lbl">7 Tage</div>
            <div className="val">{fmtMoney(k.d7, cur)}</div>
          </div>
          <div>
            <div className="lbl">Monat</div>
            <div className="val">{fmtMoney(k.month, cur)}</div>
          </div>
          <div>
            <div className="lbl">Vormonat</div>
            <div className="val">{fmtMoney(k.lastMonth, cur)}</div>
          </div>
        </div>
      </div>

      {s.unconverted?.length > 0 && (
        <p className="warn">
          Nicht in {cur} umgerechnet und deshalb <b>nicht in der Summe enthalten</b>:{' '}
          {s.unconverted.map((u) => `${fmtZahl(u.gesamt)} ${u.currency}${u.d30 && u.d30 !== u.gesamt ? ` (davon ${fmtZahl(u.d30)} in 30 Tagen)` : ''}`).join(', ')}.
        </p>
      )}
      {s.fxError && <p className="warn">Wechselkurse gerade nicht erreichbar ({s.fxError}).</p>}

      {!active.length ? (
        <div className="panel">
          <h2>Noch keine Quelle eingerichtet</h2>
          <p className="hint">Im Tab „Quellen" steht, welche Variablen fehlen. Danach „Aktualisieren" tippen.</p>
        </div>
      ) : (
        <div className="tiles">
          {active.map((src) => <Tile key={src.id} src={src} s={s} />)}
        </div>
      )}

      {top.length > 0 && (
        <>
          <div className="section">Top-Apps · 30 Tage</div>
          <div className="bars">
            {top.map((a) => {
              const farbe = SOURCE_COLORS[a.sources[0]?.id] || 'var(--blue)';
              return (
                <div className="barrow" key={a.key}>
                  <span className="dot" style={{ background: farbe }} />
                  <div className="nm">{a.name}</div>
                  <div className="bar"><div className="bar-fill" style={{ width: `${Math.max(1, Math.round((a.d30 / max) * 100))}%`, background: farbe }} /></div>
                  <div className="v">{fmtMoney(a.d30, cur)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {payouts.length > 0 && (
        <>
          <div className="section">Auszahlungen</div>
          <div className="panel">
            <table>
              <tbody>
                {payouts.map((p, i) => (
                  <tr key={i}>
                    <td>{fmtMonth(p.month)}</td>
                    <td>{p.label}</td>
                    <td style={{ textAlign: 'right' }}><b>{p.eur != null ? fmtMoney(p.eur, cur) : fmtMoney(p.amount, p.currency)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
