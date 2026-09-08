// Zeitfenster und Veränderungen aus der Tagesreihe.
//
// Wichtig: alle Fenster enden am letzten Tag, den überhaupt eine zählende Quelle
// gemeldet hat - nicht heute. Sonst zöge der Meldeverzug von 1-2 Tagen jeden
// Vergleich nach unten und die App zeigte täglich einen erfundenen Rückgang.

export const runde = (x) => Math.round(x * 100) / 100;

export function reiheBis(series, lastDayDate) {
  if (!series?.length) return [];
  if (!lastDayDate) return series;
  const i = series.findIndex((r) => r.date === lastDayDate);
  return i < 0 ? series : series.slice(0, i + 1);
}

export function summe(reihe, feld = 'total') {
  return runde(reihe.reduce((a, r) => a + (r[feld] || 0), 0));
}

// Anteilige Veränderung. Ohne belastbaren Vorwert lieber nichts zeigen als etwas Erfundenes.
export function anteil(jetzt, davor) {
  if (davor == null || davor === 0) return null;
  return (jetzt - davor) / davor;
}

// Letztes Fenster und das gleich lange davor. Ist das Vergleichsfenster nicht
// vollständig in der Reihe enthalten, gibt es keinen Vergleich.
export function fenster(reihe, tage, feld = 'total') {
  const n = reihe.length;
  const jetzt = summe(reihe.slice(Math.max(0, n - tage)), feld);
  const teil = reihe.slice(Math.max(0, n - 2 * tage), Math.max(0, n - tage));
  const davor = teil.length === tage ? summe(teil, feld) : null;
  return { jetzt, davor, delta: anteil(jetzt, davor) };
}

// Laufender Monat gegen denselben Abschnitt des Vormonats (nicht gegen den
// ganzen Vormonat - das verglich einen halben mit einem vollen Monat).
export function monat(reihe, feld = 'total') {
  const bis = reihe[reihe.length - 1]?.date;
  if (!bis) return { jetzt: 0, davor: null, delta: null };
  const [j, m, t] = bis.split('-').map(Number);
  const jetzt = summe(reihe.filter((r) => r.date >= `${bis.slice(0, 7)}-01` && r.date <= bis), feld);
  const vormonat = new Date(Date.UTC(j, m - 2, 1)).toISOString().slice(0, 7);
  // Den 31. gibt es nicht in jedem Monat; dann bis zum Monatsende vergleichen.
  const letzterTag = new Date(Date.UTC(j, m - 1, 0)).getUTCDate();
  const bisVormonat = `${vormonat}-${String(Math.min(t, letzterTag)).padStart(2, '0')}`;
  const vollstaendig = reihe[0]?.date <= `${vormonat}-01`;
  const davor = vollstaendig
    ? summe(reihe.filter((r) => r.date >= `${vormonat}-01` && r.date <= bisVormonat), feld)
    : null;
  return { jetzt, davor, delta: anteil(jetzt, davor) };
}

// Durchschnitt der n Tage vor dem letzten - ruhigerer Vergleich als der Vortag allein.
export function schnittDavor(reihe, tage = 7, feld = 'total') {
  const teil = reihe.slice(-(tage + 1), -1);
  return teil.length === tage ? summe(teil, feld) / tage : null;
}
