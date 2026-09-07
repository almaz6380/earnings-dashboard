// Alles, was nur in der nativen App (Capacitor) passiert. Im Browser sind die
// Funktionen harmlos: sie tun nichts oder fallen auf window.open zurück.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const NATIV = Capacitor.isNativePlatform();
export const ANDROID = Capacitor.getPlatform() === 'android';

const HINTERGRUND = '#0f1216'; // = --bg in styles.css

// Beim Start: Statusleiste passend zum dunklen Design.
export async function nativeStart() {
  if (!NATIV) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (ANDROID) await StatusBar.setBackgroundColor({ color: HINTERGRUND });
  } catch { /* Plugin fehlt oder Plattform kann das nicht - egal */ }
}

// Splash bleibt, bis der erste Bildschirm steht (launchAutoHide: false in capacitor.config.json).
export async function splashAusblenden() {
  if (!NATIV) return;
  await SplashScreen.hide().catch(() => {});
}

// Ruft fn, wenn die App aus dem Hintergrund zurückkommt. Gibt eine Aufräumfunktion zurück.
export function beiRueckkehr(fn) {
  if (!NATIV) return () => {};
  const h = App.addListener('appStateChange', ({ isActive }) => { if (isActive) fn(); });
  return () => { h.then((l) => l.remove()).catch(() => {}); };
}

// Android-Zurück-Taste: fn entscheidet (true = verbraucht), sonst App in den Hintergrund.
export function beiZurueck(fn) {
  if (!ANDROID) return () => {};
  const h = App.addListener('backButton', () => { if (!fn()) App.minimizeApp().catch(() => {}); });
  return () => { h.then((l) => l.remove()).catch(() => {}); };
}

// Externe Seite öffnen: in der App im System-Browser-Sheet, im Web als neuer Tab.
export async function extern(url) {
  if (NATIV) { await Browser.open({ url, presentationStyle: 'popover' }); return; }
  window.open(url, '_blank', 'noopener');
}
