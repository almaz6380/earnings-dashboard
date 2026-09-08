import React, { useEffect, useState } from 'react';
import { fmtDate } from '../format.js';
import { api, NATIV } from '../api.js';
import { extern } from '../native.js';
import { farbe } from '../charts.jsx';
import { Punkt, Fehlerzeile } from '../components.jsx';
import { Icon } from '../icons.jsx';

const leseDatei = (datei) => new Promise((ok, weg) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result || ''));
  r.onerror = () => weg(new Error('Die Datei ließ sich nicht lesen.'));
  r.readAsText(datei);
});

function KonsoleLink({ konsole }) {
  if (!konsole) return null;
  return (
    <button type="button" className="link klein" onClick={() => extern(konsole.url)}>
      {konsole.text} <Icon.extern />
    </button>
  );
}

// Formular für einen Eintrag: Zugangsdaten, Kontosuche, Speichern mit Probeabruf.
function EintragForm({ q, eintrag, google, onFertig, onAbbruch }) {
  const neu = !eintrag;
  const [form, setForm] = useState(() => ({
    google: eintrag?.google || (q.google ? google.verbindungen[0]?.id || '' : undefined),
    label: eintrag?.label || '',
  }));
  const [kandidaten, setKandidaten] = useState(null);
  const [sucht, setSucht] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ergebnis, setErgebnis] = useState(null);

  const wert = (k) => (k in form ? (form[k] ?? '') : (eintrag?.werte?.[k]?.value ?? ''));
  const gesetzt = (k) => !!eintrag?.werte?.[k]?.set;

  // Suchen geht, sobald die Voraussetzung dafür da ist: eine Google-Verbindung
  // oder das Geheimnis, mit dem die Quelle ihre Konten auflistet.
  const kannSuchen = q.entdeckbar && (
    q.google ? !!form.google
      : (q.entdeckenAb || []).every((k) => form[k] || gesetzt(k)) || (q.id === 'revenuecat' && form.oauth)
  );

  async function suchen() {
    setSucht(true); setErr(null); setKandidaten(null);
    try {
      const r = await api('/api/discover', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quelle: q.id, eintrag: { ...form, id: eintrag?.id } }),
      });
      setKandidaten(r.kandidaten || []);
      if (!r.kandidaten?.length) setErr('Zu diesem Zugang gibt es nichts zu holen. Stimmen die Berechtigungen?');
    } catch (e) { setErr(e.message); } finally { setSucht(false); }
  }

  async function speichern(e) {
    e.preventDefault();
    setBusy(true); setErr(null); setErgebnis(null);
    try {
      await api('/api/config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quelle: q.id, eintrag: { ...form, id: eintrag?.id } }),
      });
      // Sofort ausprobieren, statt den Nutzer bis morgen früh raten zu lassen.
      let probe = null;
      try { probe = await api('/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quelle: q.id }) }); }
      catch (e2) { probe = { fehler: e2.message }; }
      setErgebnis(probe);
      await onFertig(!probe?.fehler);
      if (!probe?.fehler) onAbbruch();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function dateiWaehlen(f, datei) {
    if (!datei) return;
    try { setForm({ ...form, [f.key]: (await leseDatei(datei)).trim() }); setErr(null); }
    catch (e) { setErr(e.message); }
  }

  return (
    <form className="eintrag-form" onSubmit={speichern}>
      {q.help && <p className="hinweis klein">{q.help} <KonsoleLink konsole={q.konsole} /></p>}

      {q.google && (
        <label className="feld">
          <span className="lbl">Google-Konto</span>
          {google.verbindungen.length ? (
            <select value={form.google || ''} onChange={(e) => { setForm({ ...form, google: e.target.value }); setKandidaten(null); }}>
              {google.verbindungen.map((v) => <option key={v.id} value={v.id}>{v.email || v.id}</option>)}
            </select>
          ) : <span className="hinweis klein">Zuerst oben ein Google-Konto verbinden.</span>}
        </label>
      )}

      {q.loginMoeglich && (
        <label className="haken">
          <input type="checkbox" checked={!!form.oauth} onChange={(e) => { setForm({ ...form, oauth: e.target.checked }); setKandidaten(null); }} />
          <span>Über den RevenueCat-Login statt über einen Schlüssel</span>
        </label>
      )}

      {q.entdeckbar && (
        <div className="btnzeile">
          <button type="button" className="btn klein" onClick={suchen} disabled={!kannSuchen || sucht}>
            {sucht ? 'Suche …' : 'Konten suchen'}
          </button>
          {!kannSuchen && <span className="hinweis klein" style={{ alignSelf: 'center' }}>Erst den Zugang oben ausfüllen.</span>}
        </div>
      )}

      {kandidaten?.length > 0 && (
        <div className="kandidaten">
          {kandidaten.map((k, i) => {
            const gewaehlt = Object.entries(k.werte).every(([kk, vv]) => (form[kk] ?? eintrag?.werte?.[kk]?.value) === vv);
            return (
              <button type="button" key={i} className={`kandidat${gewaehlt ? ' aktiv' : ''}`}
                onClick={() => setForm({ ...form, ...k.werte, label: form.label || k.label })}>
                <span className="nm">{k.label}</span>
                {k.hinweis && <span className="hw">{k.hinweis}</span>}
                {gewaehlt && <Icon.gut size={15} />}
              </button>
            );
          })}
        </div>
      )}

      <div className="felder">
        {q.felder.map((f) => {
          const versteckt = q.id === 'revenuecat' && form.oauth && f.key === 'REVENUECAT_API_KEY';
          if (versteckt) return null;
          const geloescht = form[f.key] === null;
          const props = {
            value: geloescht ? '' : wert(f.key),
            placeholder: gesetzt(f.key)
              ? (f.secret ? `gesetzt (${eintrag.werte[f.key].hint}) – leer lassen heißt unverändert` : '')
              : (f.optional ? 'optional' : 'erforderlich'),
            autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false,
            onChange: (e) => setForm({ ...form, [f.key]: e.target.value }),
          };
          return (
            <label className="feld" key={f.key}>
              <span className="lbl">
                {f.label}
                {gesetzt(f.key) && !(f.key in form) && <em className="gesetzt">gesetzt</em>}
                {geloescht && <em className="weg">wird entfernt</em>}
              </span>
              {f.multiline ? <textarea rows={4} {...props} /> : <input type={f.secret ? 'password' : 'text'} autoComplete="off" {...props} />}
              {/* Die .p8-Datei auf dem Telefon per Hand einzufügen ist kaum machbar. */}
              {f.datei && (
                <label className="datei">
                  <input type="file" accept={f.datei} onChange={(e) => dateiWaehlen(f, e.target.files?.[0])} />
                  <span>{f.datei}-Datei auswählen …</span>
                </label>
              )}
              {f.hint && <span className="hinweis klein">{f.hint}</span>}
            </label>
          );
        })}
        <label className="feld">
          <span className="lbl">Eigener Name <span className="hinweis klein">optional</span></span>
          <input value={form.label ?? ''} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="z. B. Firmenkonto" />
        </label>
      </div>

      <div className="btnzeile">
        <button className="btn primaer klein" disabled={busy}>{busy ? 'Prüfe …' : neu ? 'Verbinden' : 'Speichern'}</button>
        <button type="button" className="btn klein leise" onClick={onAbbruch}>Abbrechen</button>
      </div>
      {err && <Fehlerzeile>{err}</Fehlerzeile>}
      {ergebnis?.fehler && <Fehlerzeile>Gespeichert, aber der Abruf klemmt: {ergebnis.fehler}</Fehlerzeile>}
      {ergebnis?.ok && <div className="gutzeile"><Icon.gut />{ergebnis.text}</div>}
    </form>
  );
}

function Quelle({ q, google, live, onGeaendert, onCollect, busy }) {
  const [offen, setOffen] = useState(null); // null | 'neu' | Eintrags-ID
  const [err, setErr] = useState(null);
  const marke = !q.configured ? ['aus', 'nicht eingerichtet']
    : live?.status === 'ok' ? ['ok', 'aktiv']
      : live?.status === 'error' ? ['err', 'Fehler'] : ['aus', 'noch nicht abgerufen'];
  const zustand = q.configured ? live : null;

  async function entfernen(e) {
    if (!confirm(`„${e.label}“ wirklich entfernen? Die bisher geholten Zahlen bleiben im Verlauf stehen.`)) return;
    try {
      await api('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', quelle: q.id, id: e.id }) });
      await onGeaendert();
    } catch (e2) { setErr(e2.message); }
  }

  return (
    <div className="karte">
      <div className="quelle-kopf" style={{ marginBottom: 6 }}>
        <Punkt farbe={q.configured ? farbe(q.id) : 'var(--karte3)'} gross />
        <span className="name" style={{ flex: 1, fontSize: 15 }}>{q.label}</span>
        <span className={`marke-badge ${marke[0]}`}>{marke[0] === 'ok' && <Icon.gut size={13} />}{marke[1]}</span>
      </div>
      <div className="hinweis klein">{q.art}</div>

      {zustand?.error && <div style={{ marginTop: 8 }}><Fehlerzeile>{zustand.error}</Fehlerzeile></div>}
      {zustand?.note && !zustand?.error && <div className="hinweis klein" style={{ marginTop: 6 }}>{zustand.note}</div>}
      {zustand?.lastOk && !zustand?.error && <div className="hinweis klein" style={{ marginTop: 4 }}>Zuletzt erfolgreich {fmtDate(zustand.lastOk)}</div>}

      {q.eintraege.length > 0 && (
        <div className="eintraege">
          {q.eintraege.map((e) => (
            <div className="eintrag" key={e.id}>
              <div className="nm">
                {e.label}
                {!e.vollstaendig && <em className="weg">unvollständig</em>}
                {e.google && google.verbindungen.length > 1 && (
                  <span className="hinweis klein"> · {google.verbindungen.find((v) => v.id === e.google)?.email || 'unbekanntes Google-Konto'}</span>
                )}
              </div>
              <button type="button" className="link klein" onClick={() => setOffen(offen === e.id ? null : e.id)}>
                {offen === e.id ? 'Schließen' : 'Ändern'}
              </button>
              <button type="button" className="link klein loeschen" onClick={() => entfernen(e)}>Entfernen</button>
              {offen === e.id && (
                <EintragForm q={q} eintrag={e} google={google}
                  onFertig={onGeaendert} onAbbruch={() => setOffen(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {offen === 'neu'
        ? <EintragForm q={q} google={google} onFertig={onGeaendert} onAbbruch={() => setOffen(null)} />
        : (
          <div className="btnzeile" style={{ marginTop: 12 }}>
            <button type="button" className={`btn klein${q.eintraege.length ? '' : ' primaer'}`}
              disabled={q.eintraege.length > 0 && !q.mehrfach}
              onClick={() => setOffen('neu')}>
              {q.eintraege.length ? 'Weiteres Konto hinzufügen' : 'Verbinden'}
            </button>
            {q.configured && <button type="button" className="btn klein leise" onClick={onCollect} disabled={busy}>{busy ? 'Rufe ab …' : 'Jetzt abrufen'}</button>}
          </div>
        )}
      {err && <Fehlerzeile>{err}</Fehlerzeile>}
    </div>
  );
}

export default function Einrichten({ s, status, onChanged, onCollect, busy }) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const [gbusy, setGbusy] = useState(false);

  async function laden() {
    try { setCfg(await api('/api/config')); setErr(null); } catch (e) { setErr(e.message); }
  }
  useEffect(() => { laden(); }, []);

  async function geaendert(auchDaten = true) {
    await laden();
    if (auchDaten) await onChanged();
  }

  async function verbinde(pfad) {
    setGbusy(true); setErr(null);
    try {
      if (!NATIV) { location.href = `/api/${pfad}/start`; return; }
      const { url } = await api(`/api/${pfad}/link`);
      await extern(url);
    } catch (e) { setErr(e.message); } finally { setGbusy(false); }
  }

  async function trenneGoogle(v) {
    const betroffen = (cfg?.quellen || []).filter((q) => q.eintraege.some((e) => e.google === v.id)).map((q) => q.label);
    const text = betroffen.length
      ? `„${v.email || v.id}“ trennen? ${betroffen.join(' und ')} wird dann nicht mehr abgerufen.`
      : `„${v.email || v.id}“ wirklich trennen?`;
    if (!confirm(text)) return;
    setGbusy(true);
    await api('/api/google/disconnect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v.id }) }).catch((e) => setErr(e.message));
    setGbusy(false);
    geaendert();
  }

  async function trenneRc() {
    if (!confirm('RevenueCat-Login trennen? Einträge ohne eigenen Schlüssel werden dann nicht mehr abgerufen.')) return;
    setGbusy(true);
    await api('/api/revenuecat/disconnect', { method: 'POST' }).catch((e) => setErr(e.message));
    setGbusy(false);
    geaendert();
  }

  if (!cfg) return err ? <div className="karte"><Fehlerzeile>{err}</Fehlerzeile></div> : <p className="hinweis">Lade …</p>;
  const g = cfg.google;
  const rc = cfg.revenuecat;

  return (
    <>
      <div className="karte">
        <h2>Verbindungen</h2>
        <p className="hinweis klein" style={{ marginTop: -4 }}>
          Ein Login gilt für alle Dienste dahinter. Du kannst mehrere Konten verbinden – etwa AdMob privat und die Play Console über die Firma.
        </p>

        {!g.verfuegbar ? (
          <p className="hinweis klein">Der Google-Login ist auf diesem Server nicht eingerichtet. AdMob, AdSense und Google Play stehen darum nicht zur Verfügung.</p>
        ) : (
          <div className="verbindungen">
            {g.verbindungen.map((v) => (
              <div className="verbindung" key={v.id}>
                <Punkt farbe={v.lastError ? 'var(--kritisch)' : 'var(--gut)'} gross />
                <div className="nm">
                  {v.email || 'Google-Konto'}
                  <span className="hinweis klein">verbunden seit {fmtDate(v.connectedAt)}</span>
                  {v.lastError && <span className="fehler klein">{v.lastError}</span>}
                </div>
                <button type="button" className="link klein loeschen" onClick={() => trenneGoogle(v)} disabled={gbusy}>Trennen</button>
              </div>
            ))}
            <div className="btnzeile">
              <button className={`btn klein${g.verbindungen.length ? '' : ' primaer'}`} onClick={() => verbinde('google')} disabled={gbusy}>
                {g.verbindungen.length ? 'Weiteres Google-Konto' : 'Google-Konto verbinden'}{NATIV && <Icon.extern />}
              </button>
            </div>
            {!g.verbindungen.length && (
              <p className="hinweis klein">Wir lesen danach nur deine AdMob- und AdSense-Berichte sowie die Play-Finanzberichte. Es wird nichts geändert.</p>
            )}
          </div>
        )}

        {rc.verfuegbar && (
          <div className="verbindungen" style={{ marginTop: 14, borderTop: '1px solid var(--linie)', paddingTop: 14 }}>
            {rc.verbunden ? (
              <div className="verbindung">
                <Punkt farbe={rc.lastError ? 'var(--kritisch)' : 'var(--gut)'} gross />
                <div className="nm">
                  RevenueCat
                  <span className="hinweis klein">verbunden seit {fmtDate(rc.connectedAt)}</span>
                  {rc.lastError && <span className="fehler klein">{rc.lastError}</span>}
                </div>
                <button type="button" className="link klein loeschen" onClick={trenneRc} disabled={gbusy}>Trennen</button>
              </div>
            ) : (
              <div className="btnzeile">
                <button className="btn klein" onClick={() => verbinde('revenuecat')} disabled={gbusy}>
                  Mit RevenueCat anmelden{NATIV && <Icon.extern />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="abschnitt">Quellen <span className="zusatz">{cfg.quellen.filter((q) => q.configured).length} von {cfg.quellen.length} eingerichtet</span></div>
      <div className="raster zwei">
        {cfg.quellen.map((q) => (
          <Quelle key={q.id} q={q} google={g} live={s.bySource[q.id]} onGeaendert={geaendert} onCollect={onCollect} busy={busy} />
        ))}
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
      {err && <Fehlerzeile>{err}</Fehlerzeile>}
    </>
  );
}
