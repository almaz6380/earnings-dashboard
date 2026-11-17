import React, { useId } from 'react';
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { SERIE, FLAECHE, TINTE, CHROM, TICK } from './theme.js';
import { fmtMoney } from './format.js';

// Gemeinsame Bausteine für alle Diagramme.
//
// Zwei Regeln stecken in den Formen unten und sind der Grund, warum die Balken
// nicht einfach <Bar> sind:
//   Abstand  Zwischen berührenden Flächen liegen 2px in der Flächenfarbe. Erzeugt
//            wird die Lücke, indem jedes Segment außer dem äußersten 2px kürzer
//            gezeichnet wird - nicht durch eine Umrandung. Ein Rahmen um eine Marke
//            wäre Tinte, die keine Daten trägt.
//   Ende     Nur das äußerste Segment bekommt 4px Rundung; an der Grundlinie und an
//            allen Stoßkanten bleibt es eckig.
const LUECKE = 2;
const RUNDUNG = 4;
const MAX_BALKEN = 24; // Marken bleiben dünn; der Rest des Fachs ist Luft.

export const farbe = (id) => SERIE[id] || TINTE.gedaempft;

// ---- Formen ---------------------------------------------------------------

// Senkrechte Säule eines Stapels. `oben` markiert das oberste sichtbare Segment.
function Saeule({ x, y, width, height, fill, payload, dataKey }) {
  if (!(height > 0) || !(width > 0)) return null;
  const oben = payload?.__oben === dataKey;
  const w = Math.min(width, MAX_BALKEN);
  const px = x + (width - w) / 2;
  // Lücke oberhalb jedes Segments, das noch eines über sich hat.
  const luecke = !oben && height > LUECKE + 1 ? LUECKE : 0;
  const py = y + luecke;
  const h = height - luecke;
  const r = oben ? Math.min(RUNDUNG, w / 2, h) : 0;
  const d = r
    ? `M${px},${py + h}V${py + r}a${r},${r} 0 0 1 ${r},${-r}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${py + h}Z`
    : `M${px},${py}h${w}v${h}h${-w}Z`;
  return <path d={d} fill={fill} />;
}

// Waagerechter Balken eines Stapels; das Datenende zeigt nach rechts.
// Nur am äußersten Segment steht die Summe der Zeile - nicht an jedem Segment.
function Balken({ x, y, width, height, fill, payload, dataKey, cur, stellen }) {
  if (!(width > 0) || !(height > 0)) return null;
  const aussen = payload?.__aussen === dataKey;
  const h = Math.min(height, MAX_BALKEN);
  const py = y + (height - h) / 2;
  const luecke = !aussen && width > LUECKE + 1 ? LUECKE : 0;
  const w = width - luecke;
  const r = aussen ? Math.min(RUNDUNG, h / 2, w) : 0;
  const d = r
    ? `M${x},${py}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`
    : `M${x},${py}h${w}v${h}h${-w}Z`;
  return (
    <>
      <path d={d} fill={fill} />
      {aussen && payload?.__summe != null && (
        <text x={x + w + 8} y={py + h / 2} dominantBaseline="central" fill={TINTE.sekundaer} fontSize={11.5}>
          {fmtMoney(payload.__summe, cur, stellen)}
        </text>
      )}
    </>
  );
}

// Merkt sich je Zeile, welches Segment außen liegt - nur das wird gerundet.
export function markiereAussen(zeilen, ids, feld = '__oben') {
  return zeilen.map((z) => {
    const letzte = [...ids].reverse().find((id) => (z[id] || 0) > 0) || null;
    return { ...z, [feld]: letzte };
  });
}

// ---- Tooltips -------------------------------------------------------------

// Der Wert führt, der Name folgt; Serien werden mit einem kurzen Strich gekennzeichnet.
function Zeilen({ eintraege, cur, titel, summe }) {
  return (
    <div className="tooltip">
      <div className="tt-titel">{titel}</div>
      {eintraege.map((e) => (
        <div className="tt-zeile" key={e.key}>
          <span className="tt-strich" style={{ background: e.farbe }} />
          {e.name}
          <span className="tt-wert">{fmtMoney(e.wert, cur)}</span>
        </div>
      ))}
      {summe != null && (
        <div className="tt-zeile summe">Summe<span className="tt-wert">{fmtMoney(summe, cur)}</span></div>
      )}
    </div>
  );
}

function StapelTooltip({ active, payload, label, cur, labels, fmtLabel }) {
  if (!active || !payload?.length) return null;
  const eintraege = payload
    .filter((p) => p.value)
    .map((p) => ({ key: p.dataKey, name: labels[p.dataKey] || p.dataKey, wert: p.value, farbe: p.color || p.fill }))
    .reverse();
  if (!eintraege.length) return <Zeilen titel={fmtLabel(label)} eintraege={[]} summe={0} cur={cur} />;
  const summe = eintraege.reduce((a, e) => a + e.wert, 0);
  return <Zeilen titel={fmtLabel(label)} eintraege={eintraege} summe={eintraege.length > 1 ? summe : null} cur={cur} />;
}

function FlaechenTooltip({ active, payload, label, cur, fmtLabel, name }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return <Zeilen titel={fmtLabel(label)} cur={cur} eintraege={[{ key: 'w', name, wert: p.value, farbe: p.color || p.stroke }]} />;
}

// ---- Legende (immer vorhanden, sobald zwei Serien im Bild sind) -----------

export function Legende({ ids, labels, farben }) {
  if (ids.length < 2) return null;
  return (
    <div className="legende">
      {ids.map((id) => (
        <span key={id}><i className="schluessel" style={{ background: farben?.[id] || farbe(id) }} />{labels[id] || id}</span>
      ))}
    </div>
  );
}

// ---- Sparkline: Verlauf ohne Achsen, für Kacheln und Quellenkarten -------

export function Sparkline({ daten, feld = 'wert', color = SERIE.admob, hoehe = 44 }) {
  const id = useId().replace(/:/g, '');
  const werte = daten.map((d) => d[feld] || 0);
  const max = Math.max(...werte, 0);
  if (!daten.length || max <= 0) return <div style={{ height: hoehe }} />;
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <AreaChart data={daten} margin={{ top: 3, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={feld} stroke={color} strokeWidth={2} strokeLinecap="round"
          fill={`url(#sp${id})`} isAnimationActive={false} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Trendfläche: eine Serie über die Zeit, mit Achsen und Fadenkreuz -----

export function TrendFlaeche({ daten, feld, cur, color = SERIE.admob, name, fmtLabel, hoehe = 150, achsen = true }) {
  const id = useId().replace(/:/g, '');
  const letzte = daten[daten.length - 1];
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <AreaChart data={daten} margin={{ top: 6, right: achsen ? 10 : 6, left: achsen ? 0 : 6, bottom: 0 }}>
        <defs>
          <linearGradient id={`tf${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {achsen && <CartesianGrid vertical={false} stroke={CHROM.gitter} strokeDasharray="0" />}
        {achsen && <XAxis dataKey="date" tickFormatter={fmtLabel} tick={TICK} stroke={CHROM.achse} tickLine={false} minTickGap={28} />}
        {achsen && <YAxis tick={TICK} stroke={CHROM.achse} tickLine={false} axisLine={false} width={58}
          tickFormatter={(v) => fmtMoney(v, cur, 0)} />}
        <Tooltip content={<FlaechenTooltip cur={cur} fmtLabel={fmtLabel} name={name} />}
          cursor={{ stroke: CHROM.achse, strokeWidth: 1 }} />
        <Area type="monotone" dataKey={feld} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          fill={`url(#tf${id})`} isAnimationActive={false}
          activeDot={{ r: 4.5, fill: color, stroke: FLAECHE.karte, strokeWidth: 2 }}
          // Nur der Endpunkt bekommt eine Marke: 2px Ring in der Flächenfarbe,
          // damit sie über der Linie lesbar bleibt und die große Zahl darüber verankert.
          dot={(p) => (p.index === daten.length - 1 && letzte
            ? <circle key="ende" cx={p.cx} cy={p.cy} r={4} fill={color} stroke={FLAECHE.karte} strokeWidth={2} />
            : null)} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---- Kurslinie: zum Durchfahren, die Werte stehen außerhalb des Diagramms ---
//
// Kein Tooltip-Kasten: unter dem Finger verdeckte er genau die Stelle, auf die man
// zeigt. Das Diagramm meldet nur, welcher Punkt aktiv ist (`onAktiv`), und die Karte
// darüber zeigt Zahl und Aufteilung. `vergleich` zeichnet eine zweite, blasse Linie
// aus dem Feld `gestern`.
export function KursLinie({ daten, stufen, zahlenAchse, bereich, ticks, fmtTick, vergleich, onAktiv, color = SERIE.admob, hoehe = 190 }) {
  const id = useId().replace(/:/g, '');
  const melde = (z) => onAktiv(z?.isTooltipActive && z.activeTooltipIndex != null ? z.activeTooltipIndex : null);
  // Endmarke am letzten Punkt mit Wert - bei „Heute" endet die Linie mitten im Diagramm.
  let ende = -1;
  daten.forEach((d, i) => { if (d.wert != null) ende = i; });
  const form = stufen ? 'stepAfter' : 'monotone';
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <ComposedChart data={daten} margin={{ top: 8, right: 20, left: 20, bottom: 0 }}
        onMouseMove={melde} onMouseLeave={() => onAktiv(null)}>
        <defs>
          <linearGradient id={`kl${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.26} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="x" type={zahlenAchse ? 'number' : 'category'} domain={bereich} ticks={ticks} tickFormatter={fmtTick}
          tick={TICK} axisLine={false} tickLine={false} minTickGap={30} interval="preserveStartEnd" />
        <YAxis hide domain={[0, (max) => (max > 0 ? max * 1.08 : 1)]} />
        <Tooltip content={() => null} cursor={{ stroke: TINTE.gedaempft, strokeWidth: 1 }} />
        {vergleich && (
          <Line type={form} dataKey="gestern" stroke={TINTE.gedaempft} strokeWidth={1.5} strokeDasharray="3 4"
            dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
        )}
        <Area type={form} dataKey="wert" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          fill={`url(#kl${id})`} isAnimationActive={false} connectNulls={false}
          activeDot={{ r: 5, fill: color, stroke: FLAECHE.karte, strokeWidth: 2 }}
          dot={(p) => (p.index === ende
            ? <circle key="ende" cx={p.cx} cy={p.cy} r={4} fill={color} stroke={FLAECHE.karte} strokeWidth={2} />
            : null)} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ---- Gestapelte Säulen: mehrere Quellen über die Zeit ---------------------

export function StapelSaeulen({ daten, xKey, ids, labels, cur, fmtLabel, hoehe = 260, farben }) {
  const zeilen = markiereAussen(daten, ids, '__oben');
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <BarChart data={zeilen} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={CHROM.gitter} strokeDasharray="0" />
        <XAxis dataKey={xKey} tickFormatter={fmtLabel} tick={TICK} stroke={CHROM.achse} tickLine={false} minTickGap={24} />
        <YAxis tick={TICK} stroke={CHROM.achse} tickLine={false} axisLine={false} width={58}
          tickFormatter={(v) => fmtMoney(v, cur, 0)} />
        <Tooltip content={<StapelTooltip cur={cur} labels={labels} fmtLabel={fmtLabel} />}
          cursor={{ fill: 'rgba(255,255,255,0.045)' }} />
        {ids.map((id) => (
          <Bar key={id} dataKey={id} name={labels[id]} stackId="a" fill={farben?.[id] || farbe(id)}
            shape={<Saeule dataKey={id} />} maxBarSize={MAX_BALKEN} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Gestapelte Balken: Apps mit langen Namen ----------------------------

export function StapelBalken({ daten, ids, labels, cur, hoehe }) {
  const zeilen = markiereAussen(daten, ids, '__aussen');
  const max = Math.max(...daten.map((d) => d.__summe || 0), 0);
  const stellen = max < 10 ? 2 : 0;
  return (
    <ResponsiveContainer width="100%" height={hoehe}>
      <BarChart data={zeilen} layout="vertical" margin={{ top: 2, right: 56, left: 0, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid horizontal={false} stroke={CHROM.gitter} strokeDasharray="0" />
        <XAxis type="number" tick={TICK} stroke={CHROM.achse} tickLine={false}
          tickFormatter={(v) => fmtMoney(v, cur, stellen)} />
        <YAxis type="category" dataKey="name" tick={{ ...TICK, fill: TINTE.sekundaer }} stroke={CHROM.achse}
          tickLine={false} axisLine={false} width={112}
          tickFormatter={(n) => (n.length > 20 ? `${n.slice(0, 19)}…` : n)} />
        <Tooltip content={<StapelTooltip cur={cur} labels={labels} fmtLabel={(v) => v} />}
          cursor={{ fill: 'rgba(255,255,255,0.045)' }} />
        {ids.map((id) => (
          <Bar key={id} dataKey={id} name={labels[id]} stackId="a" fill={farbe(id)}
            shape={<Balken dataKey={id} cur={cur} stellen={stellen} />} maxBarSize={MAX_BALKEN} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
