import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// So alt dürfen die Zahlen werden, solange die App offen ist, dann sammelt sie selbst
// nach - die leichten Quellen, die schweren holt der Actions-Lauf. Deutlich kürzer
// lohnt nicht: AdMob und AdSense melden nur ein paar Mal am Tag, jeder Abruf zählt
// aber in deren Tageskontingent.
const AUTO_MS = 5 * 60 * 1000;
// Takt der Frage „liegt auf dem Server etwas Neues?" (/api/stand, ein Zeitstempel).
// Nötig, weil der geplante Sammellauf - und ein zweites Gerät - dort Zahlen schreiben,
// von denen diese App sonst bis zum nächsten Tippen nichts wüsste. Kurz, solange
// jemand hinsieht; ruhiger, wenn der Tab nur offen steht. Kontingente, die das
// begrenzen: 100.000 Worker-Aufrufe am Tag und die Befehle des Speichers - deshalb
// kostet eine Frage genau einen Befehl und der ganze Stand kommt nur bei Änderung.
const SCHNELL_MS = 15 * 1000;
const RUHE_MS = 60 * 1000;
const AKTIV_MS = 10 * 60 * 1000; // so lange nach der letzten Eingabe gilt „sieht hin"
const TICK_MS = 5 * 1000;        // Herzschlag; gefragt wird erst, wenn der Takt es zulässt

const veraltet = (s) => !s?.collectedAt || Date.now() - Date.parse(s.collectedAt) >= AUTO_MS;
// Wie im Server: der Tag, nach dem „heute" und „gestern" gerechnet werden (UTC).
const heute = () => new Date().toISOString().slice(0, 10);
// Woran die App merkt, dass jemand davor sitzt - und nicht, dass ein Tab offen steht.
const EINGABEN = ['pointerdown', 'keydown', 'wheel', 'touchstart'];

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
  const [still, setStill] = useState(false);
  const [flash, setFlash] = useState(null);
  const [resetToken] = useState(() => new URLSearchParams(location.search).get('reset'));

  const stateRef = useRef(null);
  const laeuft = useRef(false);
  const stillerVersuch = useRef(0);

  const abgemeldet = useCallback(() => { setAuthed(false); if (NATIV) setToken(null); }, []);

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api('/api/state'), api('/api/status')]);
      stateRef.current = s;
      setState(s); setStatus(st); setError(null);
      return s;
    } catch (e) {
      if (e.status === 401) abgemeldet(); else setError(e.message);
      return null;
    }
  }, [abgemeldet]);

  // Nie zwei Läufe gleichzeitig: beide würden den Verlauf laden, mischen und speichern,
  // und der spätere überschriebe den früheren. Zieht man, während ein stiller Lauf
  // schon unterwegs ist, wird der nur sichtbar gemacht statt ein zweiter gestartet.
  const collect = useCallback(async ({ auto = false } = {}) => {
    if (laeuft.current) { if (!auto) setBusy(true); return; }
    // Still sammeln höchstens alle AUTO_MS, und zwar unabhängig davon, wie der Lauf
    // ausgeht. Bleibt der Stand stehen - weil der Server gerade sperrt, eine Quelle
    // hängt oder das Netz weg ist -, gelten die Zahlen weiter als veraltet, und ohne
    // diese Bremse versuchte die App es im Takt der Prüfung wieder, also alle 15
    // Sekunden. Von Hand bremst nichts: wer tippt, will es jetzt.
    if (auto && Date.now() - stillerVersuch.current < AUTO_MS) return;
    if (auto) stillerVersuch.current = Date.now();
    laeuft.current = true;
    if (auto) setStill(true); else { setBusy(true); setError(null); }
    try {
      const r = await api('/api/collect', { method: 'POST' });
      await load();
      // Ein anderer Lauf war schon unterwegs (der geplante oder ein zweites Gerät).
      // Kein Fehler, aber ohne Hinweis sähe es aus, als hätte das Tippen nichts getan.
      if (r?.laeuft && !auto) setFlash('Ein Sammellauf läuft gerade – die neuen Zahlen erscheinen von selbst.');
    } catch (e) {
      if (e.status === 401) abgemeldet();
      // Ohne Netz im Hintergrund nicht alle paar Minuten eine rote Zeile zeigen;
      // der nächste sichtbare Versuch meldet es dann.
      else if (!auto || e.status !== 0) setError(e.message);
    } finally {
      laeuft.current = false;
      setBusy(false); setStill(false);
    }
  }, [load, abgemeldet]);

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

  // Beim Öffnen erst den gespeicherten Stand zeigen, dann bei Bedarf still nachladen -
  // sonst stünde bis zum Ende des Sammellaufs nur „Lade Daten …" da.
  useEffect(() => {
    if (!authed) return;
    load().then((s) => { if (s && veraltet(s)) collect({ auto: true }); });
  }, [authed, load, collect]);

  // Von selbst aktuell bleiben: alle SCHNELL_MS fragen, ob der Server neuer ist als die
  // Anzeige, und beim Zurückkommen in App oder Tab sofort nachladen. Ist der Server
  // neuer - etwa nach dem geplanten Sammellauf -, kommt der volle Stand. Hat auch er
  // nichts Neues und sind die Zahlen über AUTO_MS alt, sammelt die App selbst. Im
  // Hintergrund ruht sie; dann ist der geplante Lauf auf dem Server zuständig.
  useEffect(() => {
    if (!authed) return undefined;
    let zuletzt = 0;
    let aktiv = Date.now();
    let tag = heute();
    let offen = false; // auf langsamem Netz nicht zwei Prüfungen übereinander stapeln
    const pruefe = async ({ rueckkehr = false } = {}) => {
      if (offen || document.hidden || navigator.onLine === false || laeuft.current) return;
      // Beim Zurückkommen sofort - dort bremsen nur 2 Sekunden, weil App-Rückkehr und
      // visibilitychange auf dem Telefon beide kommen. Sonst im Takt, und der halbe
      // Herzschlag Toleranz verhindert, dass eine knapp zu frühe Prüfung eine ganze
      // Runde aussetzt.
      const abstand = rueckkehr ? 2000 : (Date.now() - aktiv < AKTIV_MS ? SCHNELL_MS : RUHE_MS) - TICK_MS / 2;
      if (Date.now() - zuletzt < abstand) return;
      zuletzt = Date.now();
      offen = true;
      try {
        // Nach Mitternacht sind „heute" und „gestern" verschoben, auch ohne neuen Lauf.
        const jetzt = heute();
        const tagwechsel = jetzt !== tag;
        tag = jetzt;
        let s = stateRef.current;
        let neu = rueckkehr || tagwechsel || !s;
        if (!neu) {
          const stand = await api('/api/stand').catch((e) => {
            // Ohne Netz oder bei einem Serverfehler still bleiben, sonst stünde in
            // diesem Takt dauernd eine rote Zeile da; nur eine abgelaufene Sitzung
            // muss auffallen.
            if (e.status === 401) abgemeldet();
            return null;
          });
          if (!stand) return;
          neu = stand.collectedAt !== s.collectedAt;
          // Auch der Server hat nichts Neueres: dann sammelt die App selbst, aber nur,
          // wenn die Zahlen wirklich alt sind.
          if (!neu && !veraltet(s)) return;
        }
        if (neu) s = await load();
        if (s && veraltet(s)) collect({ auto: true });
      } finally {
        offen = false;
      }
    };
    const zurueck = () => { aktiv = Date.now(); pruefe({ rueckkehr: true }); };
    const aktivitaet = () => { aktiv = Date.now(); };
    const t = setInterval(pruefe, TICK_MS);
    document.addEventListener('visibilitychange', zurueck);
    window.addEventListener('online', zurueck);
    for (const e of EINGABEN) window.addEventListener(e, aktivitaet, { passive: true });
    const weg = beiRueckkehr(zurueck);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', zurueck);
      window.removeEventListener('online', zurueck);
      for (const e of EINGABEN) window.removeEventListener(e, aktivitaet);
      weg();
    };
  }, [authed, load, collect, abgemeldet]);
  useEffect(() => { history.replaceState(null, '', `#${tab}`); }, [tab]);
  useEffect(() => { if (authed !== null) splashAusblenden(); }, [authed]);
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

  async function logout({ still = false } = {}) {
    if (!still) await api('/api/logout', { method: 'POST' }).catch(() => {});
    if (NATIV) await setToken(null);
    stateRef.current = null;
    stillerVersuch.current = 0; // nach einer neuen Anmeldung sofort wieder sammeln dürfen
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
        <PullToRefresh onRefresh={() => collect()} busy={busy} />
        <header className="top">
          <div className="marke">
            <Logo size={30} />
            <div>
              <h1>Einnahmen</h1>
              <span className="stand">{state?.collectedAt ? `Stand ${fmtDate(state.collectedAt)}` : 'Noch kein Abruf'}</span>
            </div>
          </div>
          <div className="rechts">
            <button className="btn klein" onClick={() => collect()} disabled={busy}>{busy || still ? 'Rufe ab …' : 'Aktualisieren'}</button>
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
            {tab === 'einrichten' && <Einrichten s={state} status={status} onChanged={load} onCollect={() => collect()} busy={busy} />}
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
