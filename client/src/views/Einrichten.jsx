import React, { useEffect, useState } from 'react';
import { fmtDate, SOURCE_ORDER } from '../format.js';
import { api, NATIV } from '../api.js';
import { extern } from '../native.js';
import { farbe } from '../charts.jsx';
import { Punkt, Fehlerzeile } from '../components.jsx';
import { Icon } from '../icons.jsx';

function marke(cfg, live) {
  if (!cfg.configured) return ['aus', 'nicht eingerichtet'];
  if (live?.status === 'ok') return ['ok', 'aktiv'];
  if (live?.status === 'error') return ['err', 'Fehler'];
  return ['aus', 'noch nicht abgerufen'];
}

// Eine Quelle. Zugeklappt zeigt sie nur den Zustand; die Felder erscheinen erst
// beim Bearbeiten - sonst wäre die Seite eine Wand aus sieben Formularen.
function Quelle({ cfg, live: rohLive, values, onSaved, onCollect, busy, offen, setOffen }) {
  // Zustand einer Quelle, die gar nicht eingerichtet ist, stammt aus einem früheren
  // Lauf und wäre nur verwirrend - dann zeigen wir ihn nicht.
  const live = cfg.configured ? rohLive : null;
  const [form, setForm] = useState({});
  const [speichert, setSpeichert] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const felder = cfg.fields || [];
  const geaendert = Object.keys(form).length > 0;
  const [art, text] = marke(cfg, live);

  async function speichern(e) {
    e.preventDefault();
    setSpeichert(true); setErr(null); setOk(false);
    try {
      await api('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: form }) });
      setForm({}); setOk(true);
      await onSaved();
    } catch (e2) { setErr(e2.message); } finally { setSpeichert(false); }
  }

  return (
    <form className="karte" onSubmit={speichern}>
      <div className="quelle-kopf" style={{ marginBottom: 6 }}>
        <Punkt farbe={cfg.configured ? farbe(cfg.id) : 'var(--karte3)'} gross />
        <span className="name" style={{ flex: 1, fontSize: 15 }}>{cfg.label}</span>
        <span className={`marke-badge ${art}`}>{art === 'ok' && <Icon.gut size={13} />}{text}</span>
      </div>
      <div className="hinweis klein">{cfg.art}</div>

      {live?.error && <div style={{ marginTop: 8 }}><Fehlerzeile>{live.error}</Fehlerzeile></div>}
      {live?.note && !live?.error && <div className="hinweis klein" style={{ marginTop: 6 }}>{live.note}</div>}
      {cfg.google && cfg.configured && !cfg.googleConnected && (
        <div className="warn" style={{ marginTop: 8, marginBottom: 0 }}><Icon.warnung />Braucht die Google-Verbindung oben.</div>
      )}
      {live?.lastOk && !live?.error && <div className="hinweis klein" style={{ marginTop: 4 }}>Zuletzt erfolgreich {fmtDate(live.lastOk)}</div>}

      {!offen ? (
        <div className="btnzeile" style={{ marginTop: 12 }}>
          <button type="button" className={`btn klein${cfg.configured ? '' : ' primaer'}`} onClick={() => setOffen(true)}>
            {cfg.configured ? 'Zugangsdaten ändern' : 'Verbinden'}
          </button>
          {cfg.configured && <button type="button" className="btn klein leise" onClick={onCollect} disabled={busy}>{busy ? 'Rufe ab …' : 'Jetzt abrufen'}</button>}
        </div>
      ) : (
        <>
          {cfg.help && <p className="hinweis klein" style={{ marginTop: 10 }}>{cfg.help}</p>}
          <div className="felder">
            {felder.map((f) => {
              const v = values?.[f.key];
              const imForm = f.key in form;
              const geloescht = imForm && form[f.key] === null;
              const wert = imForm ? (form[f.key] ?? '') : (f.secret ? '' : (v?.value ?? ''));
              const platzhalter = v?.set
                ? (f.secret ? `gesetzt (${v.hint}) – leer lassen heißt unverändert` : '')
                : (f.optional ? 'optional' : 'erforderlich');
              const p = {
                value: wert, placeholder: platzhalter, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
                onChange: (e) => setForm({ ...form, [f.key]: e.target.value }),
              };
              return (
                <label className="feld" key={f.key}>
                  <span className="lbl">
                    {f.label}
                    {v?.set && !imForm && <em className="gesetzt">gesetzt</em>}
                    {geloescht && <em className="weg">wird entfernt</em>}
                  </span>
                  {f.multiline ? <textarea rows={4} {...p} /> : <input type={f.secret ? 'password' : 'text'} autoComplete="off" {...p} />}
                  {f.hint && <span className="hinweis klein">{f.hint}</span>}
                  {v?.set && !geloescht && (
                    <button type="button" className="link klein" onClick={() => setForm({ ...form, [f.key]: null })}>Entfernen</button>
                  )}
                </label>
              );
            })}
          </div>
          <div className="btnzeile">
            <button className="btn primaer klein" disabled={speichert || !geaendert}>{speichert ? 'Speichere …' : 'Speichern'}</button>
            <button type="button" className="btn klein leise" onClick={() => { setForm({}); setOffen(false); setErr(null); }}>
              {geaendert ? 'Verwerfen' : 'Schließen'}
            </button>
          </div>
          {err && <div style={{ marginTop: 8 }}><Fehlerzeile>{err}</Fehlerzeile></div>}
          {ok && <div className="hinweis klein" style={{ marginTop: 8 }}>Gespeichert. Mit „Aktualisieren“ oben holst du die Zahlen.</div>}
        </>
      )}
    </form>
  );
}

export default function Einrichten({ s, status, onChanged, onCollect, busy }) {
  const [config, setConfig] = useState(null);
  const [offen, setOffen] = useState({});
  const [gbusy, setGbusy] = useState(false);
  const [gerr, setGerr] = useState(null);

  async function ladeConfig() {
    try { setConfig(await api('/api/config')); } catch (e) { setGerr(e.message); }
  }
  useEffect(() => { ladeConfig(); }, []);

  if (!status) return <p className="hinweis">Lade …</p>;
  const g = status.google;
  const byId = Object.fromEntries(status.sources.map((x) => [x.id, x]));

  async function gespeichert() { await ladeConfig(); await onChanged(); }

  async function verbinden() {
    if (!NATIV) { location.href = '/api/google/start'; return; }
    setGbusy(true); setGerr(null);
    try { const { url } = await api('/api/google/link'); await extern(url); }
    catch (e) { setGerr(e.message); } finally { setGbusy(false); }
  }

  async function trennen() {
    if (!confirm('Google-Verbindung wirklich trennen? AdMob, AdSense und Play werden dann nicht mehr abgerufen.')) return;
    setGbusy(true);
    await api('/api/google/disconnect', { method: 'POST' }).catch(() => {});
    setGbusy(false);
    onChanged();
  }

  const anzahl = status.sources.filter((q) => q.configured).length;

  return (
    <>
      <div className="karte">
        <div className="quelle-kopf" style={{ marginBottom: 6 }}>
          <Punkt farbe={g.connected ? 'var(--gut)' : 'var(--karte3)'} gross />
          <span className="name" style={{ flex: 1, fontSize: 15 }}>Google-Konto</span>
          <span className={`marke-badge ${g.connected ? 'ok' : 'aus'}`}>{g.connected ? <><Icon.gut size={13} />verbunden</> : 'nicht verbunden'}</span>
        </div>
        <div className="hinweis klein">Ein Login für AdMob, AdSense und Google Play</div>
        {!status.googleAvailable ? (
          <p className="hinweis klein" style={{ marginTop: 10 }}>Der Google-Login ist auf diesem Server nicht eingerichtet. AdMob, AdSense und Google Play stehen darum nicht zur Verfügung.</p>
        ) : g.connected ? (
          <>
            <p className="hinweis klein" style={{ marginTop: 8 }}>Verbunden{g.email ? ` als ${g.email}` : ''} seit {fmtDate(g.connectedAt)}.</p>
            {g.lastError && <Fehlerzeile>{g.lastError}</Fehlerzeile>}
            <div className="btnzeile" style={{ marginTop: 12 }}>
              <button className="btn klein" onClick={verbinden} disabled={gbusy}>Erneut verbinden</button>
              <button className="btn klein leise" onClick={trennen} disabled={gbusy}>Trennen</button>
            </div>
          </>
        ) : (
          <>
            <p className="hinweis klein" style={{ marginTop: 8 }}>
              Einmal anmelden. Danach lesen wir nur deine AdMob- und AdSense-Berichte sowie die Play-Finanzberichte. Es wird nichts geändert.
            </p>
            <div className="btnzeile" style={{ marginTop: 12 }}>
              <button className="btn primaer klein" onClick={verbinden} disabled={gbusy}>
                {gbusy ? '…' : 'Google verbinden'}{NATIV && <Icon.extern />}
              </button>
            </div>
            {NATIV && <p className="hinweis klein" style={{ marginTop: 8 }}>Öffnet Google im Browser und kommt danach von selbst zurück.</p>}
          </>
        )}
        {gerr && <Fehlerzeile>{gerr}</Fehlerzeile>}
      </div>

      <div className="abschnitt">Quellen <span className="zusatz">{anzahl} von {status.sources.length} eingerichtet</span></div>
      <div className="raster zwei">
        {SOURCE_ORDER.map((id) => {
          const cfg = byId[id];
          if (!cfg) return null;
          return (
            <Quelle
              key={id}
              cfg={{ ...cfg, googleConnected: g.connected }}
              live={s.bySource[id]}
              values={config?.values}
              onSaved={gespeichert}
              onCollect={onCollect}
              busy={busy}
              offen={!!offen[id]}
              setOffen={(v) => setOffen({ ...offen, [id]: v })}
            />
          );
        })}
      </div>

      <div className="karte">
        <h2>So funktioniert es</h2>
        <table className="beschriftung">
          <tbody>
            <tr><td>Abruf</td><td>Täglich um 06:00 UTC{status.cronConfigured ? '' : ' (auf diesem Server nicht aktiv)'} und jederzeit über „Aktualisieren“.</td></tr>
            <tr><td>Summe</td><td>Werbung plus Abo-Umsatz {s.subsSource === 'revenuecat' ? 'laut RevenueCat' : 'laut Store-Erlösen'} – nichts zählt doppelt.</td></tr>
            <tr><td>Währung</td><td>{status.baseCurrency}{s.fxDate ? `, EZB-Kurse vom ${s.fxDate}` : ''}, änderbar unter „Konto“.</td></tr>
            <tr><td>Zugangsdaten</td><td>Liegen verschlüsselt auf dem Server, werden nie angezeigt und nur lesend genutzt.</td></tr>
            <tr><td>Letzter Abruf</td><td>{status.latest ? fmtDate(status.latest.collectedAt) : 'noch keiner'}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
