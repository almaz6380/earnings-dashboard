import React, { useCallback, useEffect, useState } from 'react';
import Uebersicht from './views/Uebersicht.jsx';
import Verlauf from './views/Verlauf.jsx';
import Quellen from './views/Quellen.jsx';
import { fmtDate } from './format.js';

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'verlauf', label: 'Verlauf' },
  { id: 'quellen', label: 'Quellen' },
];

async function api(path, opts) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.fehler || `HTTP ${res.status}`), { status: res.status });
  return data;
}

function Login({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      onOk();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }
  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h1>Einnahmen</h1>
        <p className="hint">Privates Dashboard. Bitte Passwort eingeben.</p>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Passwort" autoComplete="current-password" />
        <button className="btn primary" disabled={busy || !pw}>{busy ? '…' : 'Anmelden'}</button>
        {err && <div className="error">{err}</div>}
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [tab, setTab] = useState(() => (location.hash.replace('#', '') || 'uebersicht'));
  const [state, setState] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api('/api/state'), api('/api/status')]);
      setState(s); setStatus(st); setError(null);
    } catch (e) {
      if (e.status === 401) setAuthed(false); else setError(e.message);
    }
  }, []);

  useEffect(() => {
    api('/api/login').then((r) => setAuthed(!!r.angemeldet)).catch(() => setAuthed(false));
    const q = new URLSearchParams(location.search);
    if (q.get('google')) {
      setFlash(q.get('google') === 'ok' ? `Google verbunden${q.get('email') ? ` (${q.get('email')})` : ''}. Jetzt „Aktualisieren" tippen.` : `Google-Verbindung fehlgeschlagen: ${q.get('msg') || 'unbekannter Fehler'}`);
      history.replaceState(null, '', location.pathname + location.hash);
      setTab('quellen');
    }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);

  async function collect() {
    setBusy(true); setError(null);
    try { await api('/api/collect', { method: 'POST' }); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setAuthed(false); setState(null);
  }

  if (authed === null) return <div className="app"><p className="hint">Lade …</p></div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <div className="app">
      <header className="top">
        <h1>Einnahmen</h1>
        <span className="sub">{state?.collectedAt ? `Stand ${fmtDate(state.collectedAt)}` : 'Noch kein Sammellauf'}{state?.fxDate ? ` · Kurse EZB ${state.fxDate}` : ''}</span>
        <span className="spacer" />
        <button className="btn" onClick={collect} disabled={busy}>{busy ? 'Sammle …' : 'Aktualisieren'}</button>
        <button className="btn ghost" onClick={logout}>Abmelden</button>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {flash && <div className="flash" onClick={() => setFlash(null)}>{flash}</div>}
      {error && <div className="error panel">{error}</div>}
      {!state ? <p className="hint">Lade Daten …</p> : (
        <>
          {tab === 'uebersicht' && <Uebersicht s={state} />}
          {tab === 'verlauf' && <Verlauf s={state} />}
          {tab === 'quellen' && <Quellen s={state} status={status} onChanged={load} />}
        </>
      )}
    </div>
  );
}
