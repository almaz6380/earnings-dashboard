import React from 'react';
import { Icon } from './icons.jsx';
import { fmtMoney } from './format.js';

// Veränderung. Die Richtung trägt der Pfeil und das Vorzeichen, nie die Farbe allein.
export function Delta({ wert, gross, fuss }) {
  if (wert == null) return null;
  const prozent = wert * 100;
  const gerundet = Math.round(prozent);
  const richtung = gerundet > 0 ? 'hoch' : gerundet < 0 ? 'runter' : 'neutral';
  const Pfeil = richtung === 'hoch' ? Icon.hoch : richtung === 'runter' ? Icon.runter : null;
  // Sehr kleine Vorwerte lassen den Prozentwert explodieren; ab 999 % sagt die Zahl nichts mehr.
  const text = Math.abs(gerundet) > 999
    ? `${gerundet > 0 ? '>+' : '<−'}999 %`
    : `${gerundet > 0 ? '+' : gerundet < 0 ? '−' : '±'}${Math.abs(gerundet)} %`;
  return (
    <span className={`delta ${richtung}${gross ? ' gross' : ''}`} title={fuss}>
      {Pfeil && <Pfeil />}{text}
    </span>
  );
}

// Kennzahl-Kachel: Label, Wert, optional Veränderung und eine Fußzeile, die den Vergleich benennt.
export function Kachel({ label, wert, cur, delta, fuss, titel, stellen = 2, klasse }) {
  return (
    <div className={`kachel${klasse ? ` ${klasse}` : ''}`} title={titel}>
      <div className="label">{label}</div>
      <div className="wert">{typeof wert === 'number' ? fmtMoney(wert, cur, stellen) : wert}</div>
      <div className="fuss">
        {delta != null && <Delta wert={delta} fuss={titel} />}
        <span>{fuss}</span>
      </div>
    </div>
  );
}

export function Punkt({ farbe, gross }) {
  return <span className={`punkt${gross ? ' gross' : ''}`} style={{ background: farbe }} />;
}

export function Fehlerzeile({ children }) {
  return <div className="fehler"><Icon.warnung />{children}</div>;
}

export function Warnzeile({ children }) {
  return <div className="warn"><Icon.warnung />{children}</div>;
}

export function Leer({ titel, text, knopf }) {
  return (
    <div className="karte leer">
      <h2>{titel}</h2>
      <p>{text}</p>
      {knopf}
    </div>
  );
}

// Teil-vom-Ganzen als ein Balken: 2px Abstand zwischen den Segmenten, runde Außenenden.
// Die Werte stehen in der Legende darunter, nicht im Balken - dort passen sie nicht.
export function AnteilsBalken({ teile, cur }) {
  const gesamt = teile.reduce((a, t) => a + t.wert, 0);
  if (!(gesamt > 0)) return null;
  return (
    <>
      <div className="anteil">
        {teile.filter((t) => t.wert > 0).map((t) => (
          <div key={t.id} className="anteil-seg" style={{ flexGrow: t.wert, background: t.farbe }}
            title={`${t.name}: ${fmtMoney(t.wert, cur)}`} />
        ))}
      </div>
      <div className="anteil-legende">
        {teile.filter((t) => t.wert > 0).map((t) => (
          <span key={t.id}>
            <Punkt farbe={t.farbe} />
            {t.name}
            <b>{fmtMoney(t.wert, cur)}</b>
            <i>{Math.round((t.wert / gesamt) * 100)} %</i>
          </span>
        ))}
      </div>
    </>
  );
}
