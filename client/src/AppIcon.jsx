import React, { useState } from 'react';

// App-Icon aus dem Store. Das Monogramm liegt immer darunter, das Bild darüber -
// so steht dort nie ein leeres Kästchen, egal ob das Icon fehlt, noch lädt oder
// die Adresse tot ist. Ohne Store-Eintrag (RevenueCat-Projekte) bleibt das Monogramm.
export default function AppIcon({ src, name, color, size = 32 }) {
  const [kaputt, setKaputt] = useState(false);
  const radius = Math.round(size * 0.24);

  return (
    <div
      className="appicon"
      style={{ width: size, height: size, borderRadius: radius, background: color || 'var(--panel2)', fontSize: Math.round(size * 0.44) }}
      aria-hidden="true"
    >
      {(name || '?').trim().charAt(0).toUpperCase()}
      {src && !kaputt && (
        <img src={src} alt="" style={{ borderRadius: radius }} onError={() => setKaputt(true)} />
      )}
    </div>
  );
}
