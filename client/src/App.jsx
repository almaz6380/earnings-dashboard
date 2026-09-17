import React, { useCallback, useEffect, useState } from 'react';
import Uebersicht from './views/Uebersicht.jsx';
import Verlauf from './views/Verlauf.jsx';
import Apps from './views/Apps.jsx';
import Einrichten from './views/Einrichten.jsx';
import Konto from './views/Konto.jsx';
import PullToRefresh from './PullToRefresh.jsx';
import Logo from './Logo.jsx';
import { Icon } from './icons.jsx';
import { Fehlerzeile } from './components.jsx';
import { fmtDate } from './format.js';
import { api, NATIV, DEFAULT_SERVER, getServer, setServer, setToken, hasToken, normalizeServer, apiUrl } from './api.js';
import { splashAusblenden, beiRueckkehr, beiZurueck, beiAppLink, browserSchliessen, extern } from './native.js';

const TABS = [
  { id: 'uebersicht', label: 'Übersicht', icon: Icon.uebersicht },
  { id: 'apps', label: 'Apps', icon: Icon.apps },
  { id: 'verlauf', label: 'Verlauf', icon: Icon.verlauf },
  { id: 'einrichten', label: 'Einrichten', icon: Icon.einrichten },
  { id: 'konto', label: 'Konto', icon: Icon.konto },
];

const rechtsLink = (basis, pfad) => `${basis || (NATIV ? getServer() : '')}/${pfad}`;

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
      if (modus !== 'reset' && !email.trim()) throw new Error('Bitte E-Mail-Adresse eingeben.');
      if (modus !== 'forgot' && !pw) throw new Error('Bitte Passwort eingeben.');
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
    register: 'Kostenlos. Deine Zugangsdaten bleiben verschlüsselt auf dem Server und werden nur lesend genutzt.',
    forgot: 'Wir schicken dir einen Link, mit dem du ein neues Passwort setzen kannst.',
    reset: 'Bitte ein neues Passwort wählen, mindestens 10 Zeichen.',
  }[modus];

  const linkKlick = (pfad) => (e) => {
    if (!NATIV) return;
    e.preventDefault();
    extern(rechtsLink(null, pfad));
  };

  return (
    <div className="anmelden">
      <form onSubmit={submit}>
        <div className="kopf">
          <Logo size={58} radius={17} />
          <h1>Einnahmen</h1>
          <p>{text}</p>
        </div>
        {serverFeld && (
          <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={server} onChange={(e) => setServerFeld(e.target.value)} placeholder="https://mein-server.example" autoComplete="url" />
        )}
        {modus !== 'reset' && (
          <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" autoComplete={modus === 'register' ? 'email' : 'username'} />
        )}
        {modus !== 'forgot' && (
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder={modus === 'login' ? 'Passwort' : 'Passwort, mindestens 10 Zeichen'}
            autoComplete={modus === 'login' ? 'current-password' : 'new-password'} />
        )}
        {(modus === 'register' || modus === 'reset') && (
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Passwort wiederholen" autoComplete="new-password" />
        )}
        {modus === 'register' && (
          <label className="haken">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
            <span>Ich akzeptiere die <a href={rechtsLink(null, 'nutzungsbedingungen.html')} target="_blank" rel="noreferrer" onClick={linkKlick('nutzungsbedingungen.html')}>Nutzungsbedingungen</a> und habe die <a href={rechtsLink(null, 'datenschutz.html')} target="_blank" rel="noreferrer" onClick={linkKlick('datenschutz.html')}>Datenschutzerklärung</a> gelesen.</span>
          </label>
        )}
        <button className="btn primaer breit" disabled={busy || (modus === 'register' && !accept)}>
          {busy ? '…' : titel}
        </button>
        {err && <Fehlerzeile>{err}</Fehlerzeile>}
        {info && <div className="meldung">{info}</div>}
        <div className="authlinks">
          {modus === 'login' && <>
            <button type="button" className="link" onClick={() => { setModus('register'); setErr(null); }}>Konto erstellen</button>
            <button type="button" className="link" onClick={() => { setModus('forgot'); setErr(null); }}>Passwort vergessen?</button>
          </>}
          {modus !== 'login' && <button type="button" className="link" onClick={() => { setModus('login'); setErr(null); }}>Zurück zur Anmeldung</button>}
          {NATIV && DEFAULT_SERVER && <button type="button" className="link" onClick={() => setEigener(!eigener)}>{eigener ? 'Standard-Server' : 'Eigener Server …'}</button>}
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

  // Ergebnis eines Logins anzeigen (Web: ?google=…, App: einnahmen://google?…).
  const loginErgebnis = useCallback((q) => {
    if (q.get('google')) {
      setFlash(q.get('google') === 'ok'
        ? `Google verbunden${q.get('email') ? ` (${q.get('email')})` : ''}. Wähle jetzt unten die Konten aus.`
        : `Google-Verbindung fehlgeschlagen: ${q.get('msg') || 'unbekannter Fehler'}`);
    } else if (q.get('revenuecat')) {
      setFlash(q.get('revenuecat') === 'ok'
        ? 'RevenueCat verbunden. Wähle jetzt unten deine Projekte aus.'
        : `RevenueCat-Anmeldung fehlgeschlagen: ${q.get('msg') || 'unbekannter Fehler'}`);
    } else return;
    setTab('einrichten');
  }, []);

  useEffect(() => {
    if (NATIV && !hasToken()) { setAuthed(false); return; }
    api('/api/login').then((r) => setAuthed(!!r.angemeldet)).catch((e) => {
      if (NATIV && e.status === 0) { setAuthed(true); setError(e.message); } else setAuthed(false);
    });
    const q = new URLSearchParams(location.search);
    if (q.get('google') || q.get('revenuecat')) {
      loginErgebnis(q);
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }, [loginErgebnis]);

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
      const ziel = u.host || u.pathname.replace(/^\/+/, '');
      if (ziel !== 'google' && ziel !== 'revenuecat') return;
      browserSchliessen();
      loginErgebnis(u.searchParams);
      load();
    } catch { /* fremder Link, ignorieren */ }
  }), [loginErgebnis, load]);

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

  if (authed === null) return <div className="app"><p className="hinweis">Lade …</p></div>;
  if (!authed) return <Auth onOk={angemeldet} resetToken={resetToken} />;

  const basis = status?.webUrl || apiUrl('');
  const rechtsKlick = (pfad) => (e) => { if (NATIV) { e.preventDefault(); extern(`${basis}/${pfad}`); } };

  return (
    <>
      <div className="app">
        <PullToRefresh onRefresh={collect} busy={busy} />
        <header className="top">
          <div className="marke">
            <Logo size={30} />
            <div>
              <h1>Einnahmen</h1>
              <span className="stand">{state?.collectedAt ? `Stand ${fmtDate(state.collectedAt)}` : 'Noch kein Abruf'}</span>
            </div>
          </div>
          <div className="rechts">
            <button className="btn klein" onClick={collect} disabled={busy}>{busy ? 'Rufe ab …' : 'Aktualisieren'}</button>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>

        {flash && <div className="meldung" onClick={() => setFlash(null)}>{flash}</div>}
        {error && (
          <div className="karte">
            <Fehlerzeile>{error}</Fehlerzeile>
            {!state && (
              <div className="btnzeile" style={{ marginTop: 12 }}>
                <button className="btn klein" onClick={load}>Erneut versuchen</button>
                <button className="btn klein leise" onClick={() => logout()}>{NATIV ? 'Abmelden, Server wechseln' : 'Abmelden'}</button>
              </div>
            )}
          </div>
        )}

        {!state ? (!error && <p className="hinweis">Lade Daten …</p>) : (
          <>
            {tab === 'uebersicht' && <Uebersicht s={state} onEinrichten={() => setTab('einrichten')} />}
            {tab === 'apps' && <Apps s={state} />}
            {tab === 'verlauf' && <Verlauf s={state} />}
            {tab === 'einrichten' && <Einrichten s={state} status={status} onChanged={load} onCollect={collect} busy={busy} />}
            {tab === 'konto' && <Konto status={status} onLogout={logout} onChanged={load} />}
          </>
        )}

        <footer className="fuss">
          <a href={`${basis}/datenschutz.html`} target="_blank" rel="noreferrer" onClick={rechtsKlick('datenschutz.html')}>Datenschutz</a>
          <a href={`${basis}/nutzungsbedingungen.html`} target="_blank" rel="noreferrer" onClick={rechtsKlick('nutzungsbedingungen.html')}>Nutzungsbedingungen</a>
          <a href={`${basis}/impressum.html`} target="_blank" rel="noreferrer" onClick={rechtsKlick('impressum.html')}>Impressum</a>
        </footer>
      </div>

      {/* Auf dem Telefon liegt die Navigation unten, in Daumenreichweite. */}
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); scrollTo({ top: 0 }); }} aria-current={tab === t.id ? 'page' : undefined}>
            <t.icon size={22} />{t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
