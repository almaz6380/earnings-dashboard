import React, { useEffect, useState } from 'react';
import { fmtDate } from '../format.js';
import { api, NATIV, setToken, apiUrl } from '../api.js';
import { Fehlerzeile } from '../components.jsx';

export default function Konto({ status, onLogout, onChanged }) {
  const [acc, setAcc] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({});
  const [pw, setPw] = useState({ current: '', neu: '', neu2: '' });
  const [delPw, setDelPw] = useState('');
  const [loeschen, setLoeschen] = useState(false);

  async function lade() {
    try { const a = await api('/api/account'); setAcc(a); setSettings(a.settings || {}); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { lade(); }, []);

  async function post(body) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      return await api('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  }

  async function speichern(e) {
    e.preventDefault();
    const r = await post({ action: 'settings', settings });
    if (r) { setAcc(r); setSettings(r.settings || {}); setMsg('Einstellungen gespeichert.'); onChanged(); }
  }

  async function passwort(e) {
    e.preventDefault();
    if (pw.neu !== pw.neu2) { setErr('Die neuen Passwörter stimmen nicht überein.'); return; }
    const r = await post({ action: 'password', current: pw.current, neu: pw.neu, ...(NATIV ? { token: true } : {}) });
    if (r?.ok) {
      if (NATIV && r.token) await setToken(r.token);
      setPw({ current: '', neu: '', neu2: '' });
      setMsg('Passwort geändert. Andere Geräte müssen sich neu anmelden.');
    }
  }

  async function kontoLoeschen(e) {
    e.preventDefault();
    if (!confirm('Konto und alle gespeicherten Daten unwiderruflich löschen?')) return;
    const r = await post({ action: 'delete', password: delPw });
    if (r?.geloescht) onLogout({ still: true });
  }

  if (!acc) return err ? <div className="karte"><Fehlerzeile>{err}</Fehlerzeile></div> : <p className="hinweis">Lade …</p>;
  const n = acc.notify || {};

  return (
    <>
      <div className="karte">
        <h2>Konto</h2>
        <table className="beschriftung">
          <tbody>
            <tr><td>E-Mail</td><td>{acc.email}</td></tr>
            <tr><td>Konto seit</td><td>{fmtDate(acc.createdAt)}</td></tr>
            {NATIV && <tr><td>Server</td><td>{apiUrl('')}</td></tr>}
          </tbody>
        </table>
        <div className="btnzeile" style={{ marginTop: 14 }}>
          <button className="btn klein leise" onClick={() => onLogout()}>Abmelden</button>
        </div>
      </div>

      <form className="karte" onSubmit={speichern}>
        <h2>Einstellungen</h2>
        <div className="felder">
          <label className="feld">
            <span className="lbl">Basiswährung</span>
            <select value={settings.baseCurrency || status?.baseCurrency || 'EUR'} onChange={(e) => setSettings({ ...settings, baseCurrency: e.target.value })}>
              {(acc.currencies || ['EUR']).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="hinweis klein">Alle Beträge werden mit EZB-Kursen in diese Währung umgerechnet.</span>
          </label>
          <label className="feld">
            <span className="lbl">Tägliche Meldung per ntfy</span>
            <input value={settings.ntfyTopic || ''} onChange={(e) => setSettings({ ...settings, ntfyTopic: e.target.value })}
              placeholder="ntfy-Topic, lang und zufällig" autoCapitalize="none" autoCorrect="off" />
            <span className="hinweis klein">ntfy-App installieren, Topic abonnieren, hier eintragen. Das Topic ist das einzige Passwort.</span>
          </label>
          {n.telegramAvailable && (
            <label className="feld">
              <span className="lbl">Tägliche Meldung per Telegram</span>
              <input value={settings.telegramChatId || ''} onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                placeholder="Chat-ID" inputMode="numeric" />
              <span className="hinweis klein">{n.telegramBot ? `Dem Bot @${n.telegramBot} schreiben, dann` : 'Chat-ID'} über @userinfobot ermitteln.</span>
            </label>
          )}
          <label className="haken">
            <input type="checkbox" checked={settings.notify !== false} onChange={(e) => setSettings({ ...settings, notify: e.target.checked })} />
            <span>Jeden Morgen eine Zusammenfassung senden{n.active ? ' – aktiv' : ' (braucht einen Eintrag oben)'}</span>
          </label>
        </div>
        <div className="btnzeile"><button className="btn primaer klein" disabled={busy}>Speichern</button></div>
      </form>

      <form className="karte" onSubmit={passwort}>
        <h2>Passwort ändern</h2>
        <div className="felder">
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Aktuelles Passwort" autoComplete="current-password" />
          <input type="password" value={pw.neu} onChange={(e) => setPw({ ...pw, neu: e.target.value })} placeholder="Neues Passwort, min. 10 Zeichen" autoComplete="new-password" />
          <input type="password" value={pw.neu2} onChange={(e) => setPw({ ...pw, neu2: e.target.value })} placeholder="Neues Passwort wiederholen" autoComplete="new-password" />
        </div>
        <div className="btnzeile"><button className="btn klein" disabled={busy || !pw.current || !pw.neu}>Passwort ändern</button></div>
      </form>

      <form className="karte" onSubmit={kontoLoeschen}>
        <h2>Konto löschen</h2>
        <p className="hinweis klein">
          Löscht dein Konto, alle Zugangsdaten, den Verlauf und die Google-Verbindung auf dem Server. Bei den Diensten selbst ändert sich nichts.
        </p>
        {!loeschen ? (
          <div className="btnzeile" style={{ marginTop: 12 }}>
            <button type="button" className="btn klein gefahr" onClick={() => setLoeschen(true)}>Konto löschen …</button>
          </div>
        ) : (
          <>
            <div className="felder">
              <input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Passwort zur Bestätigung" autoComplete="current-password" />
            </div>
            <div className="btnzeile">
              <button className="btn klein gefahr" disabled={busy || !delPw}>Unwiderruflich löschen</button>
              <button type="button" className="btn klein leise" onClick={() => { setLoeschen(false); setDelPw(''); }}>Abbrechen</button>
            </div>
          </>
        )}
      </form>

      {err && <div className="karte"><Fehlerzeile>{err}</Fehlerzeile></div>}
      {msg && <div className="meldung" onClick={() => setMsg(null)}>{msg}</div>}
    </>
  );
}
