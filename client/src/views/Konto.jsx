import React, { useEffect, useState } from 'react';
import { fmtDate } from '../format.js';
import { api, NATIV, setToken, apiUrl } from '../api.js';

export default function Konto({ status, onLogout, onChanged }) {
  const [acc, setAcc] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({});
  const [pw, setPw] = useState({ current: '', neu: '', neu2: '' });
  const [delPw, setDelPw] = useState('');

  async function lade() {
    try { const a = await api('/api/account'); setAcc(a); setSettings(a.settings || {}); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { lade(); }, []);

  async function post(body) {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return r;
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
      setPw({ current: '', neu: '', neu2: '' }); setMsg('Passwort geändert. Andere Geräte müssen sich neu anmelden.');
    }
  }

  async function loeschen(e) {
    e.preventDefault();
    if (!confirm('Konto und alle gespeicherten Daten unwiderruflich löschen?')) return;
    const r = await post({ action: 'delete', password: delPw });
    if (r?.geloescht) onLogout({ still: true });
  }

  if (!acc) return err ? <div className="error panel">{err}</div> : <p className="hint">Lade …</p>;
  const n = acc.notify || {};

  return (
    <>
      <div className="panel">
        <h2>Konto</h2>
        <table><tbody>
          <tr><td>E-Mail</td><td>{acc.email}</td></tr>
          <tr><td>Konto seit</td><td>{fmtDate(acc.createdAt)}</td></tr>
          {NATIV && <tr><td>Server</td><td>{apiUrl('')}</td></tr>}
        </tbody></table>
        <div className="btnrow" style={{ marginTop: 10 }}><button className="btn small ghost" onClick={() => onLogout()}>Abmelden</button></div>
      </div>

      <form className="panel" onSubmit={speichern}>
        <h2>Einstellungen</h2>
        <div className="fields">
          <label className="field">
            <span className="lbl">Basiswährung</span>
            <select value={settings.baseCurrency || status?.baseCurrency || 'EUR'} onChange={(e) => setSettings({ ...settings, baseCurrency: e.target.value })}>
              {(acc.currencies || ['EUR']).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="hint small">Alle Beträge werden mit EZB-Kursen in diese Währung umgerechnet.</span>
          </label>
          <label className="field">
            <span className="lbl">Tägliche Meldung per ntfy</span>
            <input value={settings.ntfyTopic || ''} onChange={(e) => setSettings({ ...settings, ntfyTopic: e.target.value })} placeholder="ntfy-Topic (lang und zufällig)" autoCapitalize="none" autoCorrect="off" />
            <span className="hint small">ntfy-App installieren, Topic abonnieren, hier eintragen. Das Topic ist das einzige „Passwort".</span>
          </label>
          {n.telegramAvailable && (
            <label className="field">
              <span className="lbl">Tägliche Meldung per Telegram</span>
              <input value={settings.telegramChatId || ''} onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })} placeholder="Chat-ID" inputMode="numeric" />
              <span className="hint small">{n.telegramBot ? `Dem Bot @${n.telegramBot} eine Nachricht schreiben, dann` : 'Deine Chat-ID'} über @userinfobot ermitteln und hier eintragen.</span>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={settings.notify !== false} onChange={(e) => setSettings({ ...settings, notify: e.target.checked })} />
            <span>Tägliche Zusammenfassung senden (nur wenn oben etwas eingetragen ist){n.active ? ' – aktiv' : ''}</span>
          </label>
        </div>
        <div className="btnrow"><button className="btn primary small" disabled={busy}>Speichern</button></div>
      </form>

      <form className="panel" onSubmit={passwort}>
        <h2>Passwort ändern</h2>
        <div className="fields">
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} placeholder="Aktuelles Passwort" autoComplete="current-password" />
          <input type="password" value={pw.neu} onChange={(e) => setPw({ ...pw, neu: e.target.value })} placeholder="Neues Passwort (mind. 10 Zeichen)" autoComplete="new-password" />
          <input type="password" value={pw.neu2} onChange={(e) => setPw({ ...pw, neu2: e.target.value })} placeholder="Neues Passwort wiederholen" autoComplete="new-password" />
        </div>
        <div className="btnrow"><button className="btn small" disabled={busy || !pw.current || !pw.neu}>Passwort ändern</button></div>
      </form>

      <form className="panel" onSubmit={loeschen}>
        <h2>Konto löschen</h2>
        <p className="hint">Löscht dein Konto, alle Zugangsdaten, den Verlauf und die Google-Verbindung auf dem Server. Bei den Diensten selbst ändert sich nichts.</p>
        <div className="fields">
          <input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Passwort zur Bestätigung" autoComplete="current-password" />
        </div>
        <div className="btnrow"><button className="btn small danger" disabled={busy || !delPw}>Konto unwiderruflich löschen</button></div>
      </form>

      {err && <div className="error panel">{err}</div>}
      {msg && <div className="flash" onClick={() => setMsg(null)}>{msg}</div>}
    </>
  );
}
