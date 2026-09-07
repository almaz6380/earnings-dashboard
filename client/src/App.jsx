import React, { useCallback, useEffect, useState } from 'react';
import Uebersicht from './views/Uebersicht.jsx';
import Verlauf from './views/Verlauf.jsx';
import Apps from './views/Apps.jsx';
import Quellen from './views/Quellen.jsx';
import PullToRefresh from './PullToRefresh.jsx';
import { fmtDate } from './format.js';
import { api, NATIV, getServer, setServer, setToken, hasToken, normalizeServer } from './api.js';
import { splashAusblenden, beiRueckkehr, beiZurueck } from './native.js';

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'apps', label: 'Apps' },
  { id: 'verlauf', label: 'Verlauf' },
  { id: 'quellen', label: 'Quellen' },
];

function Login({ onOk }) {
  const [server, setServerFeld] = useState(getServer());
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (NATIV) {
        const u = normalizeServer(server);
        if (!/^https:\/\/[^/]+\.[^/]+/.test(u)) throw new Error('Server-Adresse bitte als https://… angeben (kein http).');
        await setServer(u);
      }
      const r = await api('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(NATIV ? { password: pw, token: true } : { password: pw }),
      });
      if (NATIV) {
        if (!r.token) throw new Error('Der Server hat kein Token geliefert. Läuft dort die aktuelle Version?');
        await setToken(r.token);
      }
      onOk();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h1>Einnahmen</h1>
        <p className="hint">{NATIV ? 'Adresse deines Dashboards und Passwort eingeben.' : 'Privates Dashboard. Bitte Passwort eingeben.'}</p>
        {NATIV && (
          <input
            type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={server} onChange={(e) => setServerFeld(e.target.value)}
            placeholder="https://mein-dashboard.vercel.app" autoComplete="url"
          />
        )}
        <input type="password" autoFocus={!NATIV || !!server} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Passwort" autoComplete="current-password" />
        <button className="btn primary" disabled={busy || !pw || (NATIV && !server)}>{busy ? '…' : 'Anmelden'}</button>
        {err && <div className="error">{err}</div>}
        {NATIV && <p className="hint small">Die Adresse ist die, unter der das Dashboard im Browser läuft (Vercel oder eigener Server, nur https).</p>}
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
      if (e.status === 401) { setAuthed(false); if (NATIV) setToken(null); } else setError(e.message);
    }
  }, []);

  useEffect(() => {
    // In der App ohne gespeichertes Token gleich die Login-Maske, ohne Netzanfrage.
    if (NATIV && !hasToken()) { setAuthed(false); return; }
    api('/api/login').then((r) => setAuthed(!!r.angemeldet)).catch((e) => {
      // Server nicht erreichbar: in der App lieber die Fehlermeldung zeigen als das Login.
      if (NATIV && e.status === 0) { setAuthed(true); setError(e.message); } else setAuthed(false);
    });
    const q = new URLSearchParams(location.search);
    if (q.get('google')) {
      setFlash(q.get('google') === 'ok' ? `Google verbunden${q.get('email') ? ` (${q.get('email')})` : ''}. Jetzt „Aktualisieren" tippen.` : `Google-Verbindung fehlgeschlagen: ${q.get('msg') || 'unbekannter Fehler'}`);
      history.replaceState(null, '', location.pathname + location.hash);
      setTab('quellen');
    }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);

  // Splash weg, sobald klar ist, was angezeigt wird.
  useEffect(() => { if (authed !== null) splashAusblenden(); }, [authed]);

  // App kommt aus dem Hintergrund: Daten neu laden (der Cron hat vielleicht gesammelt).
  useEffect(() => { if (!authed) return undefined; return beiRueckkehr(load); }, [authed, load]);

  // Android-Zurück: erst zur Übersicht, dann App in den Hintergrund.
  useEffect(() => beiZurueck(() => {
    if (tab !== 'uebersicht') { setTab('uebersicht'); return true; }
    return false;
  }), [tab]);

  async function collect() {
    setBusy(true); setError(null);
    try { await api('/api/collect', { method: 'POST' }); await load(); }
    catch (e) { if (e.status === 401) { setAuthed(false); if (NATIV) setToken(null); } else setError(e.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    if (NATIV) await setToken(null);
    setAuthed(false); setState(null); setError(null);
  }

  if (authed === null) return <div className="app"><p className="hint">Lade …</p></div>;
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  return (
    <div className="app">
      <PullToRefresh onRefresh={collect} busy={busy} />
      <header className="top">
        <div className="top-row">
          <h1>Einnahmen</h1>
          <span className="sub">{state?.collectedAt ? `Stand ${fmtDate(state.collectedAt)}` : 'Noch kein Sammellauf'}</span>
        </div>
        <div className="btnrow">
          <button className="btn small" onClick={collect} disabled={busy}>{busy ? 'Sammle …' : 'Aktualisieren'}</button>
          <button className="btn small ghost" onClick={logout}>Abmelden</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      {flash && <div className="flash" onClick={() => setFlash(null)}>{flash}</div>}
      {error && (
        <div className="error panel">
          {error}
          {!state && <div className="btnrow" style={{ marginTop: 8 }}><button className="btn small" onClick={load}>Erneut versuchen</button><button className="btn small ghost" onClick={logout}>{NATIV ? 'Server wechseln' : 'Abmelden'}</button></div>}
        </div>
      )}
      {!state ? (!error && <p className="hint">Lade Daten …</p>) : (
        <>
          {tab === 'uebersicht' && <Uebersicht s={state} />}
          {tab === 'apps' && <Apps s={state} />}
          {tab === 'verlauf' && <Verlauf s={state} />}
          {tab === 'quellen' && <Quellen s={state} status={status} onChanged={load} />}
        </>
      )}
    </div>
  );
}
