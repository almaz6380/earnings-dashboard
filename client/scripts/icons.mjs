// Erzeugt aus den SVGs in assets/ alle Bitmaps: die Quellbilder für @capacitor/assets
// (App-Icons und Splash für iOS/Android) und die Web-Icons in public/.
// Aufruf: npm run icons  (danach npm run assets für die nativen Projekte)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BG = '#0f1216';
mkdirSync('public', { recursive: true });

async function png(svg, size, out, opts = {}) {
  let img = sharp(svg).resize(size, size);
  if (opts.flatten) img = img.flatten({ background: BG });
  await img.png().toFile(out);
  console.log('  ', out);
}

console.log('Quellbilder für @capacitor/assets:');
await png('assets/icon.svg', 1024, 'assets/icon-only.png');
await png('assets/icon-foreground.svg', 1024, 'assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#151a21' } }).png().toFile('assets/icon-background.png');
console.log('   assets/icon-background.png');
await png('assets/splash.svg', 2732, 'assets/splash.png');
await png('assets/splash.svg', 2732, 'assets/splash-dark.png');

console.log('Web-Icons (PWA, Favicon, Apple Touch):');
await png('assets/icon.svg', 192, 'public/icon-192.png');
await png('assets/icon.svg', 512, 'public/icon-512.png');
await png('assets/icon.svg', 180, 'public/apple-touch-icon.png');
// Maskable: Motiv verkleinert auf dunklem Grund, damit runde Masken nichts abschneiden.
const inner = await sharp('assets/icon-foreground.svg').resize(512, 512).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#151a21' } })
  .composite([{ input: inner }]).png().toFile('public/icon-512-maskable.png');
console.log('   public/icon-512-maskable.png');
