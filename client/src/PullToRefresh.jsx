import React, { useEffect, useRef, useState } from 'react';

const SCHWELLE = 70;   // so weit ziehen, dann löst das Loslassen aus
const MAX = 110;       // weiter geht es nicht, sonst zieht man ins Leere
const DAEMPFUNG = 0.5; // der Balken folgt dem Finger halb so schnell - fühlt sich nach Widerstand an
const RICHTUNG = 10;   // erst ab so vielen Pixeln entscheiden, ob gezogen oder gewischt wird
const OBEN = 2;        // iOS meldet nach dem Nachfedern oft Bruchteile statt 0

// Ziehen und loslassen zum Aktualisieren. Nur auf Geräten mit Touch;
// am Rechner bleibt der Knopf oben rechts der Weg.
export default function PullToRefresh({ onRefresh, busy }) {
  const [touch] = useState(() => typeof window !== 'undefined' && 'ontouchstart' in window);
  const [zug, setZug] = useState(0);
  const [zieht, setZieht] = useState(false);
  const zugRef = useRef(0);
  const start = useRef(null);
  const busyRef = useRef(busy);
  const refresh = useRef(onRefresh);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { refresh.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!touch) return undefined;
    const setze = (v) => { zugRef.current = v; setZug(v); };

    const beginn = (e) => {
      if (busyRef.current || window.scrollY > OBEN || e.touches.length !== 1) { start.current = null; return; }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, senkrecht: false };
    };

    const zieh = (e) => {
      if (start.current == null) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      // Waagerechte Gesten gehören den Tabellen, nicht uns. Entschieden wird aber erst
      // nach ein paar Pixeln: das erste touchmove wackelt oft seitlich, und wer darauf
      // reagiert, bricht jedes zweite Runterziehen ab, bevor es begonnen hat.
      if (!start.current.senkrecht) {
        if (Math.abs(dx) < RICHTUNG && Math.abs(dy) < RICHTUNG) return;
        if (Math.abs(dx) > Math.abs(dy)) { start.current = null; setze(0); setZieht(false); return; }
        start.current.senkrecht = true;
      }
      if (dy <= 0 || window.scrollY > OBEN) { if (zugRef.current) { setze(0); setZieht(false); } return; }
      e.preventDefault(); // sonst federt die Seite selbst und der Balken zittert
      setZieht(true);
      setze(Math.min(dy * DAEMPFUNG, MAX));
    };

    const ende = () => {
      if (start.current == null) return;
      start.current = null;
      const ausgeloest = zugRef.current >= SCHWELLE;
      setze(0);
      setZieht(false);
      if (ausgeloest) refresh.current();
    };

    window.addEventListener('touchstart', beginn, { passive: true });
    window.addEventListener('touchmove', zieh, { passive: false });
    window.addEventListener('touchend', ende);
    window.addEventListener('touchcancel', ende);
    return () => {
      window.removeEventListener('touchstart', beginn);
      window.removeEventListener('touchmove', zieh);
      window.removeEventListener('touchend', ende);
      window.removeEventListener('touchcancel', ende);
    };
  }, [touch]);

  if (!touch || (!zug && !busy)) return null;
  const bereit = zug >= SCHWELLE;
  return (
    <div className="ptr" style={{ height: busy ? 40 : zug, transition: zieht ? 'none' : 'height .2s ease' }} aria-live="polite">
      <span>{busy ? 'Sammle …' : bereit ? 'Loslassen zum Aktualisieren' : 'Zum Aktualisieren ziehen'}</span>
    </div>
  );
}
