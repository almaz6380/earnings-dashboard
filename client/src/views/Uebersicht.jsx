import React from 'react';
import { fmtMoney, fmtZahl, fmtDay, fmtMonth, SOURCE_ORDER } from '../format.js';
import { SERIE } from '../theme.js';
import { TrendFlaeche, Sparkline, farbe } from '../charts.jsx';
import { Kachel, Delta, Punkt, Warnzeile, Leer, AnteilsBalken } from '../components.jsx';
import { reiheBis, fenster, monat, schnittDavor, anteil, summe } from '../kennzahlen.js';
import AppIcon from '../AppIcon.jsx';

const geld = (b) => b.filter((x) => x.eur != null).reduce((a, x) => a + x.eur, 0);

// Was auf einer Quellenkarte steht. Eine Zahl, ein Label, höchstens eine Zusatzzeile.
function inhalt(src, s) {
  if (src.status === 'error') return { fehler: 'Abruf fehlgeschlagen. Was genau, steht unter „Einrichten“.' };
  switch (src.id) {
    case 'wise':
    case 'paypal':
      return {
        betrag: geld(src.balances || []), label: 'Kontostand',
        // Statt leerer Fläche unter der Zahl: woraus der Kontostand besteht.
        liste: (src.balances || []).map((b) => `${fmtZahl(b.amount)} ${b.currency}`),
      };
    case 'adsense': {
      const offen = src.balances?.length ? geld(src.balances) : null;
      return { betrag: src.d30, label: '30 Tage', spark: true, sub: offen != null ? `offen: ${fmtMoney(offen, s.baseCurrency)}` : 'Webseiten' };
    }
    case 'revenuecat': {
      const abos = src.extra?.activeSubscriptions ?? 0;
      const p = src.extra?.projects?.length || 1;
      return { betrag: src.d30, label: '30 Tage', spark: true, sub: `${abos} Abos · ${p} ${p === 1 ? 'Projekt' : 'Projekte'}` };
    }
    case 'admob': {
      // Apps zählen, nicht Zeilen: iOS und Android derselben App stehen einzeln in der Liste.
      const n = new Set((s.apps || []).filter((a) => a.sources.some((q) => q.id === 'admob')).map((a) => a.app || a.key)).size;
      return { betrag: src.d30, label: '30 Tage', spark: true, sub: n ? `${n} Apps` : null };
    }
    default:
      if (!src.hasDaily) return { ruhig: 'Verbunden. Wartet auf die erste Meldung.' };
      return { betrag: src.d30, label: '30 Tage', spark: true };
  }
}

function Quellenkarte({ src, s, reihe }) {
  const k = inhalt(src, s);
  const f = farbe(src.id);
  const spark = k.spark ? reihe.slice(-30).map((r) => ({ date: r.date, wert: r[src.id] || 0 })) : null;
  return (
    <div className={`quelle${k.fehler ? ' fehler' : ''}`}>
      <div className="quelle-kopf">
        <Punkt farbe={k.fehler ? 'var(--kritisch)' : f} />
        <span className="name">{src.label}</span>
      </div>
      {k.fehler ? (
        <div className="ruhig" style={{ color: 'var(--kritisch-text)' }}>{k.fehler}</div>
      ) : k.ruhig ? (
        <div className="ruhig">{k.ruhig}</div>
      ) : (
        <>
          <div className="betrag">{fmtMoney(k.betrag, s.baseCurrency)}</div>
          <div className="lbl">{k.label}{k.sub ? ` · ${k.sub}` : ''}</div>
        </>
      )}
      {k.liste?.length > 1 && <div className="lbl" style={{ marginTop: 6 }}>{k.liste.join(' · ')}</div>}
      {spark && <div className="spark"><Sparkline daten={spark} color={f} hoehe={42} /></div>}
    </div>
  );
}

export default function Uebersicht({ s, onEinrichten }) {
  const cur = s.baseCurrency;
  const quellen = SOURCE_ORDER.map((id) => s.bySource[id]).filter(Boolean);
  const aktive = quellen.filter((x) => x.status !== 'unconfigured');

  // Alle Zeiträume enden am letzten gemeldeten Tag, damit der Meldeverzug
  // nicht als Rückgang erscheint.
  const reihe = reiheBis(s.series, s.lastDayDate);
  const d7 = fenster(reihe, 7);
  const d30 = fenster(reihe, 30);
  const m = monat(reihe);
  // Fehlt an diesem Tag noch eine Quelle, wäre jeder Vergleich ein Vergleich von
  // Unvollständigem mit Vollständigem - dann lieber gar keine Veränderung zeigen.
  const tagVollstaendig = !s.lastDayFehlend?.length;
  // Heute laeuft noch. Der Wert bekommt deshalb keine Veraenderung und keinen Vergleich,
  // sondern nur die Angabe, wer bereits gemeldet hat. Hat noch niemand geliefert, ist
  // ein Strich ehrlicher als eine Null - die waere von "verdient nichts" nicht zu
  // unterscheiden.
  const heuteGemeldet = !!s.todaySources?.length;
  const heuteFuss = !heuteGemeldet
    ? 'noch keine Meldung'
    : s.todayFehlend?.length
      ? `bisher nur ${s.todaySources.join(' und ')}`
      : 'läuft noch, unvollständig';
  const heroSchnitt = schnittDavor(reihe, 7);
  const heroDelta = tagVollstaendig ? anteil(s.kpis.lastDay, heroSchnitt) : null;
  const trend = reihe.slice(-30);

  const verteilung = quellen
    .filter((q) => q.countsInTotal && q.hasDaily)
    .map((q) => ({ id: q.id, name: q.label, farbe: farbe(q.id), wert: summe(reihe.slice(-30), q.id) }))
    .filter((t) => t.wert > 0);

  const top = [...(s.apps || [])].filter((a) => a.d30 > 0).sort((a, b) => b.d30 - a.d30).slice(0, 5);
  const maxApp = top[0]?.d30 || 1;
  const payouts = s.payouts.slice(0, 6);

  if (!aktive.length) {
    return (
      <Leer
        titel="Noch keine Quelle verbunden"
        text="Trage unter „Einrichten“ die Zugangsdaten deiner Dienste ein. Danach holt die App deine Zahlen jeden Morgen automatisch."
        knopf={onEinrichten && <button className="btn primaer" onClick={onEinrichten}>Quelle verbinden</button>}
      />
    );
  }

  return (
    <>
      <div className="hero">
        <div className="hero-kopf">
          <div>
            <div className="hero-label">{s.lastDayDate ? `Letzter Tag · ${fmtDay(s.lastDayDate).slice(0, 6)}` : 'Letzter Tag'}</div>
            <div className="hero-wert">{s.lastDayDate ? fmtMoney(s.kpis.lastDay, cur) : '–'}</div>
          </div>
          {heroDelta != null && <Delta wert={heroDelta} davor={heroSchnitt} cur={cur} gross fuss="gegenüber dem Durchschnitt der sieben Tage davor" />}
        </div>
        {!tagVollstaendig && s.lastDayDate && (
          <div className="hero-fehlt">Ohne {s.lastDayFehlend.join(' und ')} – für diesen Tag noch nicht gemeldet.</div>
        )}
        {trend.length > 1 && (
          <div className="hero-flaeche">
            <TrendFlaeche daten={trend} feld="total" cur={cur} color={SERIE.admob} name="Summe"
              fmtLabel={(d) => fmtDay(d).slice(0, 6)} hoehe={116} achsen={false} />
            {/* Ohne Achsen braucht die Fläche eine Beschriftung, sonst ist der Zeitraum geraten. */}
            <div className="hero-spanne"><span>{fmtDay(trend[0].date).slice(0, 6)}</span><span>Summe je Tag</span><span>{fmtDay(trend[trend.length - 1].date).slice(0, 6)}</span></div>
          </div>
        )}
      </div>

      <div className="raster kpi">
        <Kachel label={s.todayDate ? `Heute · ${fmtDay(s.todayDate).slice(0, 6)}` : 'Heute'} klasse="heute"
          wert={heuteGemeldet ? s.kpis.today : '–'} cur={cur} fuss={heuteFuss}
          titel="Der laufende Tag ist noch nicht vollständig und zählt in keinem Vergleich mit." />
        <Kachel label="7 Tage" wert={d7.jetzt} cur={cur} delta={d7.delta} davor={d7.davor} fuss="ggü. 7 Tagen davor" />
        <Kachel label="30 Tage" wert={d30.jetzt} cur={cur} delta={d30.delta} davor={d30.davor} fuss="ggü. 30 Tagen davor" />
        <Kachel label="Monat" wert={m.jetzt} cur={cur} delta={m.delta} davor={m.davor} fuss="ggü. Vormonat" titel="gegenüber dem gleichen Abschnitt des Vormonats" />
        <Kachel label="Vormonat" wert={s.kpis.lastMonth} cur={cur} fuss="ganzer Monat" />
        {/* Die einzige Zahl, die bis zur nächsten Auszahlung nur wächst. Die Zeitfenster
            daneben wandern mit und bleiben bei gleichmäßigen Einnahmen gleich hoch. */}
        {s.googleSeitAuszahlung && (
          <Kachel label="Seit Auszahlung" klasse="seit" wert={s.googleSeitAuszahlung.wert} cur={cur}
            fuss={`Google · ${fmtMoney(s.googleSeitAuszahlung.offen, cur)} offen + ab ${fmtDay(s.googleSeitAuszahlung.von).slice(0, 6)}`}
            titel="AdMob und AdSense: offenes Guthaben bei Google plus die Einnahmen, die Google dort noch nicht gutgeschrieben hat. Geschätzt, bis Google abrechnet." />
        )}
      </div>
      <p className="hinweis klein" style={{ marginTop: -4 }}>
        Alle Zeiträume enden am letzten abgeschlossenen Tag{s.lastDayDate ? ` (${fmtDay(s.lastDayDate)})` : ''}. Der laufende Tag bleibt draußen und steht oben für sich. Quellen melden mit 1–2 Tagen Verzug.
      </p>

      {s.unconverted?.length > 0 && (
        <Warnzeile>
          Nicht in {cur} umgerechnet und deshalb <b>nicht in der Summe</b>:{' '}
          {s.unconverted.map((u) => `${fmtZahl(u.gesamt)} ${u.currency}`).join(', ')}.
        </Warnzeile>
      )}
      {s.fxError && <Warnzeile>Wechselkurse gerade nicht erreichbar ({s.fxError}).</Warnzeile>}

      {verteilung.length > 1 && (
        <>
          <div className="abschnitt">Woher das Geld kam <span className="zusatz">30 Tage</span></div>
          <div className="karte">
            <AnteilsBalken teile={verteilung} cur={cur} />
            {s.subsSource === 'revenuecat' && (s.bySource.appstore?.hasDaily || s.bySource.play?.hasDaily) && (
              <p className="hinweis klein" style={{ marginTop: 12 }}>
                App Store und Google Play stehen hier nicht, weil RevenueCat den Abo-Umsatz schon meldet. Sonst zählte er doppelt.
              </p>
            )}
          </div>
        </>
      )}

      <div className="abschnitt">Quellen</div>
      <div className="raster quellen">
        {aktive.map((src) => <Quellenkarte key={src.id} src={src} s={s} reihe={reihe} />)}
      </div>

      {top.length > 0 && (
        <>
          <div className="abschnitt">Größte Apps <span className="zusatz">30 Tage</span></div>
          <div className="karte">
            <div className="balken">
              {top.map((a) => (
                <div className="balkenzeile" key={a.key}>
                  <AppIcon src={a.icon} name={a.name} color={farbe(a.sources[0]?.id)} size={28} />
                  <div className="nm">{a.name}</div>
                  <div className="spur">
                    <div className="fuellung" style={{ width: `${Math.max(3, Math.round((a.d30 / maxApp) * 100))}%`, background: SERIE.admob }} />
                  </div>
                  <div className="v">{fmtMoney(a.d30, cur, a.d30 < 10 ? 2 : 0)}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {payouts.length > 0 && (
        <>
          <div className="abschnitt">Auszahlungen <span className="zusatz">tatsächlich überwiesen</span></div>
          <div className="karte">
            <table>
              <tbody>
                {payouts.map((p, i) => (
                  <tr key={`${p.source}-${p.month}-${i}`}>
                    <td>{fmtMonth(p.month)}</td>
                    <td style={{ color: 'var(--ink3)' }}>{p.label}</td>
                    <td className="zahl"><b>{p.eur != null ? fmtMoney(p.eur, cur) : fmtMoney(p.amount, p.currency)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
