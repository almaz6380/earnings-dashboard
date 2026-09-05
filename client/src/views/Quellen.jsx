import React, { useState } from 'react';
import { fmtDate, SOURCE_ORDER } from '../format.js';

export default function Quellen({ s, status, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (!status) return <p className="hint">Lade …</p>;
  const g = status.google;
  const byId = Object.fromEntries(status.sources.map((x) => [x.id, x]));

  async function disconnect() {
    if (!confirm('Google-Verbindung wirklich trennen?')) return;
    setBusy(true);
    await fetch('/api/google/disconnect', { method: 'POST', credentials: 'same-origin' });
    setBusy(false);
    onChanged();
  }

  return (
    <>
      <div className="panel">
        <h2>Google-Konto (AdMob, AdSense, Play)</h2>
        {!g.configured ? (
          <p className="hint">GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET fehlen in den Umgebungsvariablen. Anleitung im README, Abschnitt „Google".</p>
        ) : g.connected ? (
          <>
            <p>Verbunden{g.email ? ` als ${g.email}` : ''} seit {fmtDate(g.connectedAt)}.</p>
            {g.lastError && <p className="error">{g.lastError}</p>}
            <div className="btnrow">
              <a className="btn" href="/api/google/start">Erneut verbinden</a>
              <button className="btn ghost" onClick={disconnect} disabled={busy}>Trennen</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">Einmal anmelden, dann liest das Dashboard AdMob, AdSense und Play-Finanzberichte nur lesend.</p>
            <a className="btn primary" href="/api/google/start">Google verbinden</a>
            {g.redirectUri && <p className="hint small">Weiterleitungs-URI für den OAuth-Client: <code>{g.redirectUri}</code></p>}
          </>
        )}
      </div>

      <div className="grid cols2">
        {SOURCE_ORDER.map((id) => {
          const cfg = byId[id], live = s.bySource[id];
          if (!cfg) return null;
          return (
            <div className="panel" key={id}>
              <div className="source-head"><span className="name">{cfg.label}</span>
                <span className={`badge ${!cfg.configured ? 'off' : live?.status === 'ok' ? 'ok' : live?.status === 'error' ? 'err' : 'off'}`}>{!cfg.configured ? 'nicht eingerichtet' : live?.status === 'ok' ? 'aktiv' : live?.status === 'error' ? 'Fehler' : 'noch nicht abgerufen'}</span>
              </div>
              <div className="hint">{cfg.art}</div>
              {!cfg.configured && <div className="hint">Fehlt: <code>{cfg.missing.join(', ')}</code></div>}
              {cfg.google && cfg.configured && !g.connected && <div className="hint">Braucht die Google-Verbindung oben.</div>}
              {live?.error && <div className="error">{live.error}</div>}
              {live?.note && <div className="hint small">{live.note}</div>}
              {live?.lastOk && <div className="hint small">Zuletzt erfolgreich {fmtDate(live.lastOk)}</div>}
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>System</h2>
        <table>
          <tbody>
            <tr><td>Speicher</td><td>{status.storage}</td></tr>
            <tr><td>Basiswährung</td><td>{status.baseCurrency}{s.fxDate ? ` · EZB-Kurse vom ${s.fxDate}` : ''}</td></tr>
            <tr><td>Summe</td><td>Werbung (AdMob, AdSense) + Abo-Umsatz {s.subsSource === 'revenuecat' ? 'laut RevenueCat (vor Store-Abzug)' : 'laut Store-Erlösen (App Store, Play)'}. Quellen melden mit 1–2 Tagen Verzug.</td></tr>
            <tr><td>Cron-Secret</td><td>{status.cronConfigured ? 'gesetzt (täglicher Lauf per Vercel-Cron)' : 'fehlt – kein automatischer Lauf'}</td></tr>
            <tr><td>Benachrichtigung</td><td>{status.notify ? 'Telegram/ntfy aktiv' : 'keine (TELEGRAM_* oder NTFY_TOPIC setzen)'}</td></tr>
            <tr><td>Letzter Lauf</td><td>{status.latest ? `${fmtDate(status.latest.collectedAt)} (${status.latest.ms} ms)` : 'noch keiner'}</td></tr>
            {status.latest?.notify && <tr><td>Letzte Meldung</td><td>{JSON.stringify(status.latest.notify)}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
