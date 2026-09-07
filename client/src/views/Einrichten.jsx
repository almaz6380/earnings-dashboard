import React, { useEffect, useState } from 'react';
import { fmtDate, SOURCE_ORDER } from '../format.js';
import { api, NATIV } from '../api.js';
import { extern } from '../native.js';

// Ein Formular je Quelle. Geheime Werte kommen nie zurück - das Feld zeigt nur
// „gesetzt (…1234)". Leer lassen heißt: unverändert. „Entfernen" löscht den Wert.
function QuelleForm({ cfg, live, values, onSaved, onCollect, busy }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const felder = cfg.fields || [];
  const geaendert = Object.keys(form).length > 0;

  async function save(e) {
    e.preventDefault();
    setSaving(true); setErr(null); setOk(false);
    try {
      await api('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ values: form }) });
      setForm({}); setOk(true);
      await onSaved();
    } catch (e2) { setErr(e2.message); } finally { setSaving(false); }
  }

  const badge = !cfg.configured ? ['off', 'nicht eingerichtet'] : live?.status === 'ok' ? ['ok', 'aktiv'] : live?.status === 'error' ? ['err', 'Fehler'] : ['off', 'noch nicht abgerufen'];

  return (
    <form className="panel source-card" onSubmit={save}>
      <div className="source-head"><span className="name">{cfg.label}</span><span className={`badge ${badge[0]}`}>{badge[1]}</span></div>
      <div className="hint">{cfg.art}</div>
      {cfg.help && <p className="hint small">{cfg.help}</p>}
      {cfg.google && !cfg.googleConnected && <div className="warn">Braucht die Google-Verbindung oben.</div>}
      {live?.error && <div className="error">{live.error}</div>}
      {live?.note && <div className="hint small">{live.note}</div>}
      {live?.lastOk && <div className="hint small">Zuletzt erfolgreich {fmtDate(live.lastOk)}</div>}
      <div className="fields">
        {felder.map((f) => {
          const v = values?.[f.key];
          const inForm = f.key in form;
          const wert = inForm ? (form[f.key] ?? '') : (f.secret ? '' : (v?.value ?? ''));
          const platzhalter = v?.set ? (f.secret ? `gesetzt (${v.hint}) – leer lassen = unverändert` : '') : (f.optional ? 'optional' : 'erforderlich');
          const props = {
            value: wert, placeholder: platzhalter, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
            onChange: (e) => setForm({ ...form, [f.key]: e.target.value }),
          };
          return (
            <label className="field" key={f.key}>
              <span className="lbl">{f.label}{v?.set && !inForm ? <em className="set">gesetzt</em> : null}{inForm && form[f.key] === null ? <em className="del">wird entfernt</em> : null}</span>
              {f.multiline ? <textarea rows={4} {...props} /> : <input type={f.secret ? 'password' : 'text'} autoComplete="off" {...props} />}
              {f.hint && <span className="hint small">{f.hint}</span>}
              {v?.set && !(inForm && form[f.key] === null) && <button type="button" className="link small" onClick={() => setForm({ ...form, [f.key]: null })}>Entfernen</button>}
            </label>
          );
        })}
      </div>
      <div className="btnrow">
        <button className="btn primary small" disabled={saving || !geaendert}>{saving ? 'Speichere …' : 'Speichern'}</button>
        {geaendert && <button type="button" className="btn small ghost" onClick={() => setForm({})}>Verwerfen</button>}
        {cfg.configured && !geaendert && <button type="button" className="btn small" onClick={onCollect} disabled={busy}>{busy ? 'Rufe ab …' : 'Jetzt abrufen'}</button>}
      </div>
      {err && <div className="error">{err}</div>}
      {ok && <div className="hint small">Gespeichert.</div>}
    </form>
  );
}

export default function Einrichten({ s, status, onChanged, onCollect, busy }) {
  const [config, setConfig] = useState(null);
  const [gbusy, setGbusy] = useState(false);
  const [gerr, setGerr] = useState(null);

  async function ladeConfig() {
    try { setConfig(await api('/api/config')); } catch (e) { setGerr(e.message); }
  }
  useEffect(() => { ladeConfig(); }, []);

  if (!status) return <p className="hint">Lade …</p>;
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

  return (
    <>
      <div className="panel">
        <h2>Google-Konto (AdMob, AdSense, Play)</h2>
        {!status.googleAvailable ? (
          <p className="hint">Der Google-Login ist auf diesem Server nicht eingerichtet. AdMob, AdSense und Google Play stehen darum nicht zur Verfügung.</p>
        ) : g.connected ? (
          <>
            <p>Verbunden{g.email ? ` als ${g.email}` : ''} seit {fmtDate(g.connectedAt)}.</p>
            {g.lastError && <p className="error">{g.lastError}</p>}
            <div className="btnrow">
              <button className="btn" onClick={verbinden} disabled={gbusy}>Erneut verbinden</button>
              <button className="btn ghost" onClick={trennen} disabled={gbusy}>Trennen</button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">Einmal mit Google anmelden. Wir lesen danach nur: AdMob-Berichte, AdSense-Berichte und die Play-Finanzberichte in deinem Cloud-Storage. Nichts wird geändert.</p>
            <button className="btn primary" onClick={verbinden} disabled={gbusy}>{gbusy ? '…' : 'Google verbinden'}</button>
            {NATIV && <p className="hint small">Öffnet Google im Browser und kommt danach automatisch zurück.</p>}
          </>
        )}
        {gerr && <div className="error">{gerr}</div>}
      </div>

      <div className="grid cols2">
        {SOURCE_ORDER.map((id) => {
          const cfg = byId[id];
          if (!cfg) return null;
          return <QuelleForm key={id} cfg={{ ...cfg, googleConnected: g.connected }} live={s.bySource[id]} values={config?.values} onSaved={gespeichert} onCollect={onCollect} busy={busy} />;
        })}
      </div>

      <div className="panel">
        <h2>So funktioniert es</h2>
        <table>
          <tbody>
            <tr><td>Abruf</td><td>Täglich automatisch um 06:00 UTC{status.cronConfigured ? '' : ' (auf diesem Server nicht aktiv)'} und jederzeit mit „Aktualisieren". Quellen melden mit 1–2 Tagen Verzug.</td></tr>
            <tr><td>Summe</td><td>Werbung (AdMob, AdSense) + Abo-Umsatz {s.subsSource === 'revenuecat' ? 'laut RevenueCat (vor Store-Abzug)' : 'laut Store-Erlösen (App Store, Play)'} - nichts zählt doppelt.</td></tr>
            <tr><td>Währung</td><td>{status.baseCurrency}{s.fxDate ? ` · EZB-Kurse vom ${s.fxDate}` : ''} - änderbar unter „Konto".</td></tr>
            <tr><td>Zugangsdaten</td><td>Liegen AES-256-verschlüsselt auf dem Server, werden nie angezeigt und nur lesend genutzt.</td></tr>
            <tr><td>Letzter Abruf</td><td>{status.latest ? `${fmtDate(status.latest.collectedAt)} (${status.latest.ms} ms)` : 'noch keiner'}</td></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
