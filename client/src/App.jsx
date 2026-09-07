import React, { useCallback, useEffect, useState } from 'react';
import Uebersicht from './views/Uebersicht.jsx';
import Verlauf from './views/Verlauf.jsx';
import Apps from './views/Apps.jsx';
import Einrichten from './views/Einrichten.jsx';
import Konto from './views/Konto.jsx';
import PullToRefresh from './PullToRefresh.jsx';
import { fmtDate } from './format.js';
import { api, NATIV, DEFAULT_SERVER, getServer, setServer, setToken, hasToken, normalizeServer, apiUrl } from './api.js';
import { splashAusblenden, beiRueckkehr, beiZurueck, beiAppLink, browserSchliessen, extern } from './native.js';

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'apps', label: 'Apps' },
  { id: 'verlauf', label: 'Verlauf' },
  { id: 'einrichten', label: 'Einrichten' },
  { id: 'konto', label: 'Konto' },
];

const rechtsLink = (pfad) => `${NATIV ? getServer() : ''}/${pfad}`;

// Anmelden, Registrieren, Passwort vergessen, Passwort zurücksetzen - ein Bildschirm, vier Zustände.
function Auth({ onOk, resetToken }) {
  const [modus, setModus] = useState(resetToken ? 'reset' : 'login');
  const [server, setServerFeld] = useState(getServer());
  const [eigener, setEigener] = useState(NATIV && !DEFAULT_SERVER);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [accept, setAccept] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const serverFeld = NATIV && eigener;

  async function serverSetzen() {
    if (!NATIV) return;
    const u = normalizeServer(serverFeld ? server : (getServer() || DEFAULT_SERVER));
    if (!/^https:\/\/[^/]+\.[^/]+/.test(u)) throw new Error('Server-Adresse bitte als https://… angeben (kein http).');
    await setServer(u);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setInfo(null);
    try {
      await serverSetzen();
      if (modus === 'forgot') {
        const r = await api('/api/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'forgot', email }) });
        setInfo(r.hinweis || 'E-Mail unterwegs.');
        return;
      }
      if (modus === 'reset') {
        if (pw !== pw2) throw new Error('Die Passwörter stimmen nicht überein.');
        await api('/api/password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reset', token: resetToken, password: pw }) });
        history.replaceState(null, '', location.pathname);
        setInfo('Passwort gesetzt. Jetzt anmelden.'); setModus('login'); setPw(''); setPw2('');
        return;
      }
      if (modus === 'register' && pw !== pw2) throw new Error('Die Passwörter stimmen nicht überein.');
      const body = { email, password: pw, ...(NATIV ? { token: true } : {}), ...(modus === 'register' ? { accept } : {}) };
      const r = await api(modus === 'register' ? '/api/register' : '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (NATIV) {
        if (!r.token) throw new Error('Der Server hat kein Token geliefert. Läuft dort die aktuelle Version?');
        await setToken(r.token);
      }
      onOk(modus === 'register');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const titel = { login: 'Anmelden', register: 'Konto erstellen', forgot: 'Passwort vergessen', reset: 'Neues Passwort' }[modus];
  const text = {
    login: 'Alle App-Einnahmen an einer Stelle.',
    register: 'Kostenloses Konto. Deine Zugangsdaten zu den Diensten bleiben verschlüsselt auf dem Server und werden nur lesend genutzt.',
    forgot: 'Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.',
    reset: 'Bitte ein neues Passwort wählen (mindestens 10 Zeichen).',
  }[modus];

  return (
    <div className="login">
      <form className="panel" onSubmit={submit}>
        <h1>Einnahmen</h1>
        <p className="hint">{text}</p>
        {serverFeld && (
          <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={server} onChange={(e) => setServerFeld(e.target.value)} placeholder="https://mein-server.example" autoComplete="url" />
        )}
        {modus !== 'reset' && (
          <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" autoComplete={modus === 'register' ? 'email' : 'username'} />
        )}
        {modus !== 'forgot' && (
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={modus === 'login' ? 'Passwort' : 'Passwort (mind. 10 Zeichen)'}
            autoComplete={modus === 'login' ? 'current-password' : 'new-password'} />
        )}
        {(modus === 'register' || modus === 'reset') && (
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Passwort wiederholen" autoComplete="new-password" />
        )}
        {modus === 'register' && (
          <label className="check">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>Ich akzeptiere die <a href={rechtsLink('nutzungsbedingungen.html')} target="_blank" rel="noreferrer" onClick={(e) => { if (NATIV) { e.preventDefault(); extern(rechtsLink('nutzungsbedingungen.html')); } }}>Nutzungsbedingungen</a> und habe die <a href={rechtsLink('datenschutz.html')} target="_blank" rel="noreferrer" onClick={(e) => { if (NATIV) { e.preventDefault(); extern(rechtsLink('datenschutz.html')); } }}>Datenschutzerklärung</a> gelesen.</span>
          </label>
        )}
        <button className="btn primary" disabled={busy || (modus !== 'reset' && !email) || (modus !== 'forgot' && !pw) || (modus === 'register' && !accept) || (serverFeld && !server)}>
          {busy ? '…' : titel}
        </button>
        {err && <div className="error">{err}</div>}
        {info && <div className="flash">{info}</div>}
        <div className="authlinks">
          {modus === 'login' && <><button type="button" className="link" onClick={() => { setModus('register'); setErr(null); }}>Konto erstellen</button><button type="button" className="link" onClick={() => { setModus('forgot'); setErr(null); }}>Passwort vergessen?</button></>}
          {modus !== 'login' && <button type="button" className="link" onClick={() => { setModus('login'); setErr(null); }}>Zurück zur Anmeldung</button>}
          {NATIV && DEFAULT_SERVER && <button type="button" className="link" onClick={() => setEigener(!eigener)}>{eigener ? 'Standard-Server verwenden' : 'Eigener Server …'}</button>}
        </div>
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
  const [resetToken] = useState(() => new URLSearchParams(location.search).get('reset'));

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api('/api/state'), api('/api/status')]);
      setState(s); setStatus(st); setError(null);
    } catch (e) {
      if (e.status === 401) { setAuthed(false); if (NATIV) setToken(null); } else setError(e.message);
    }
  }, []);

  // Ergebnis des Google-Logins anzeigen (Web: ?google=…, App: einnahmen://google?…).
  const googleErgebnis = useCallback((q) => {
    setFlash(q.get('google') === 'ok' ? `Google verbunden${q.get('email') ? ` (${q.get('email')})` : ''}. Jetzt „Aktualisieren" tippen.` : `Google-Verbindung fehlgeschlagen: ${q.get('msg') || 'unbekannter Fehler'}`);
    setTab('einrichten');
  }, []);

  useEffect(() => {
    if (NATIV && !hasToken()) { setAuthed(false); return; }
    api('/api/login').then((r) => setAuthed(!!r.angemeldet)).catch((e) => {
      if (NATIV && e.status === 0) { setAuthed(true); setError(e.message); } else setAuthed(false);
    });
    const q = new URLSearchParams(location.search);
    if (q.get('google')) {
      googleErgebnis(q);
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }, [googleErgebnis]);

  useEffect(() => { if (authed) load(); }, [authed, load]);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  useEffect(() => { if (authed !== null) splashAusblenden(); }, [authed]);
  useEffect(() => { if (!authed) return undefined; return beiRueckkehr(load); }, [authed, load]);
  useEffect(() => beiZurueck(() => {
    if (tab !== 'uebersicht') { setTab('uebersicht'); return true; }
    return false;
  }), [tab]);
  useEffect(() => beiAppLink((url) => {
    try {
      const u = new URL(url);
      if (u.host !== 'google' && u.pathname !== '//google') return;
      browserSchliessen();
      googleErgebnis(u.searchParams);
      load();
    } catch { /* fremder Link, ignorieren */ }
  }), [googleErgebnis, load]);

  async function collect() {
    setBusy(true); setError(null);
    try { await api('/api/collect', { method: 'POST' }); await load(); }
    catch (e) { if (e.status === 401) { setAuthed(false); if (NATIV) setToken(null); } else setError(e.message); }
    finally { setBusy(false); }
  }

  async function logout({ still = false } = {}) {
    if (!still) await api('/api/logout', { method: 'POST' }).catch(() => {});
    if (NATIV) await setToken(null);
    setAuthed(false); setState(null); setStatus(null); setError(null); setTab('uebersicht');
  }

  function angemeldet(neu) {
    setAuthed(true);
    if (neu) { setTab('einrichten'); setFlash('Willkommen! Verbinde jetzt deine erste Quelle.'); }
  }

  if (authed === null) return <div className="app"><p className="hint">Lade …</p></div>;
  if (!authed) return <Auth onOk={angemeldet} resetToken={resetToken} />;

  const nichtsEingerichtet = status && !status.sources.some((q) => q.configured);

  return (
    <div className="app">
      <PullToRefresh onRefresh={collect} busy={busy} />
      <header className="top">
        <div className="top-row">
          <h1>Einnahmen</h1>
          <span className="sub">{state?.collectedAt ? `Stand ${fmtDate(state.collectedAt)}` : 'Noch kein Abruf'}</span>
        </div>
        <div className="btnrow">
          <button className="btn small" onClick={collect} disabled={busy}>{busy ? 'Rufe ab …' : 'Aktualisieren'}</button>
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
          {!state && <div className="btnrow" style={{ marginTop: 8 }}><button className="btn small" onClick={load}>Erneut versuchen</button><button className="btn small ghost" onClick={() => logout()}>{NATIV ? 'Abmelden / Server wechseln' : 'Abmelden'}</button></div>}
        </div>
      )}
      {!state ? (!error && <p className="hint">Lade Daten …</p>) : (
        <>
          {tab === 'uebersicht' && nichtsEingerichtet && (
            <div className="panel">
              <h2>Erste Schritte</h2>
              <p>Noch keine Quelle verbunden. Unter „Einrichten" trägst du RevenueCat, AdMob, App Store, Google Play, Wise oder PayPal ein - danach „Aktualisieren".</p>
              <button className="btn primary" onClick={() => setTab('einrichten')}>Zum Einrichten</button>
            </div>
          )}
          {tab === 'uebersicht' && <Uebersicht s={state} />}
          {tab === 'apps' && <Apps s={state} />}
          {tab === 'verlauf' && <Verlauf s={state} />}
          {tab === 'einrichten' && <Einrichten s={state} status={status} onChanged={load} onCollect={collect} busy={busy} />}
          {tab === 'konto' && <Konto status={status} onLogout={logout} onChanged={load} />}
        </>
      )}
      <footer className="foot">
        <a href={`${status?.webUrl || apiUrl('')}/datenschutz.html`} target="_blank" rel="noreferrer" onClick={(e) => { if (NATIV) { e.preventDefault(); extern(`${status?.webUrl || apiUrl('')}/datenschutz.html`); } }}>Datenschutz</a>
        <a href={`${status?.webUrl || apiUrl('')}/nutzungsbedingungen.html`} target="_blank" rel="noreferrer" onClick={(e) => { if (NATIV) { e.preventDefault(); extern(`${status?.webUrl || apiUrl('')}/nutzungsbedingungen.html`); } }}>Nutzungsbedingungen</a>
      </footer>
    </div>
  );
}
