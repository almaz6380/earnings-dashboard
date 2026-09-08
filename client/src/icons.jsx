import React from 'react';

// Strichzeichnungen, 22px, folgen der Schriftfarbe. Bewusst schlicht: in der
// Tab-Leiste zählt die Silhouette, nicht das Detail.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ children, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>;
}

export const Icon = {
  uebersicht: (p) => <Svg {...p}><path {...P} d="M4 19V5" /><path {...P} d="M4 15.5 9.5 10l4 3.5L20 6" /><circle {...P} cx="20" cy="6" r="1.6" /></Svg>,
  apps: (p) => <Svg {...p}><rect {...P} x="3.5" y="3.5" width="7" height="7" rx="2" /><rect {...P} x="13.5" y="3.5" width="7" height="7" rx="2" /><rect {...P} x="3.5" y="13.5" width="7" height="7" rx="2" /><rect {...P} x="13.5" y="13.5" width="7" height="7" rx="2" /></Svg>,
  verlauf: (p) => <Svg {...p}><path {...P} d="M4 20V4" /><path {...P} d="M4 20h16" /><rect {...P} x="7" y="12" width="3.2" height="5" rx="1" /><rect {...P} x="13.8" y="7" width="3.2" height="10" rx="1" /></Svg>,
  einrichten: (p) => <Svg {...p}><path {...P} d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle {...P} cx="15" cy="7" r="2.2" /><circle {...P} cx="9" cy="17" r="2.2" /></Svg>,
  konto: (p) => <Svg {...p}><circle {...P} cx="12" cy="8.5" r="3.6" /><path {...P} d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></Svg>,
  hoch: (p) => <Svg {...p} size={p?.size || 14}><path {...P} d="M12 19V6" /><path {...P} d="m6 11 6-6 6 6" /></Svg>,
  runter: (p) => <Svg {...p} size={p?.size || 14}><path {...P} d="M12 5v13" /><path {...P} d="m6 13 6 6 6-6" /></Svg>,
  warnung: (p) => <Svg {...p} size={p?.size || 15}><path {...P} d="M12 4.5 21 20H3z" /><path {...P} d="M12 10.5v4M12 17.2v.1" /></Svg>,
  gut: (p) => <Svg {...p} size={p?.size || 15}><circle {...P} cx="12" cy="12" r="8.5" /><path {...P} d="m8.5 12.2 2.4 2.4 4.6-5" /></Svg>,
  extern: (p) => <Svg {...p} size={p?.size || 14}><path {...P} d="M13 5h6v6" /><path {...P} d="M19 5l-8 8" /><path {...P} d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V7.5A1.5 1.5 0 0 1 6.5 6H10" /></Svg>,
};
