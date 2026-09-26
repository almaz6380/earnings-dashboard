// Farbwerte für alles, was als SVG gezeichnet wird (Diagramme). CSS-Variablen lösen
// sich in SVG-Attributen nicht zuverlässig auf, darum stehen die Werte hier als Hex.
// Sie müssen zu den :root-Variablen in styles.css passen.
//
// Die Serienfarben sind die Slots 1-5 der geprüften Palette in genau dieser Reihenfolge.
// Die Reihenfolge ist die Sicherung gegen Farbfehlsichtigkeit, nicht Geschmack:
// benachbarte Paare halten den Abstand ein (schlechtestes Paar ΔE 8,4 protan,
// 19,3 normalsichtig, alle über 3:1 Kontrast auf beiden Flächen). Nicht umsortieren.
export const SERIE = {
  admob: '#3987e5',      // Slot 1 blau
  adsense: '#d95926',    // Slot 2 orange
  revenuecat: '#199e70', // Slot 3 aqua
  appstore: '#c98500',   // Slot 4 gelb
  play: '#d55181',       // Slot 5 magenta
  wise: '#9085e9',       // Slot 7 violett (nur Kontostände, nie im selben Diagramm gestapelt)
  paypal: '#e66767',     // Slot 8 rot
};

// Apps im Verlauf: dieselben Slots 1-5 in derselben Reihenfolge, der Rest gedämpft.
// Mehr als fünf Farben trennt das Auge im Stapel nicht mehr sicher.
export const APP_FARBEN = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
export const APP_REST = '#5b6573';

export const FLAECHE = {
  app: '#0d1014',
  karte: '#151a21',
  karte2: '#1c222b',
};

export const TINTE = {
  primaer: '#eef1f5',
  sekundaer: '#a8b2c1',
  gedaempft: '#8b95a3',
};

export const CHROM = {
  gitter: '#232a35',   // eine Stufe neben der Karte, Haarlinie, durchgezogen
  achse: '#333c4a',
};

export const STATUS = {
  gut: '#0ca30c',
  warnung: '#fab219',
  ernst: '#ec835a',
  kritisch: '#d03b3b',
  // Als Fließtext erreicht #d03b3b nur 3,64:1. Für Fehlertexte darum der hellere
  // Rot-Schritt derselben Familie (5,41:1).
  kritischText: '#e66767',
};

// Achsen, Gitter und Tooltip-Rahmen sind in jedem Diagramm gleich.
export const TICK = { fill: TINTE.gedaempft, fontSize: 11 };
export const GITTER = { stroke: CHROM.gitter, strokeDasharray: '0' };
