# Hinweise für Claude Code

Privates Dashboard, das Einnahmen aus RevenueCat, AdMob, AdSense, App Store, Google Play,
Wise und PayPal in Euro an einer Stelle zeigt. Läuft lokal als Express-Server und auf
Vercel als eine einzige Serverless-Funktion.

## Befehle

```bash
npm run dev      # Server und Client zusammen, lokal
npm test         # node --test server/test/*.test.js
npm run build    # baut client/dist
npm run collect  # einmaliger Sammellauf über die CLI
```

Vor jedem Push `npm test` **und** `npm run build` laufen lassen. Der Build ist der einzige
Ort, an dem Fehler im Client auffallen, es gibt keinen Typprüfer und kein Linting.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `server/` | Express lokal, dazu Handler, die auch als Vercel-Funktion laufen |
| `server/sources/` | je Einnahmequelle ein Modul mit `meta`, `vollstaendig`, `fetchData` |
| `server/routen.js` | Zuordnung Pfad → Handler, für beide Betriebsarten |
| `client/` | React, Vite, recharts; `views/` sind die vier Tabs |
| `api/index.js` | einziger Vercel-Einstieg, reicht an `server/routen.js` weiter |

## Regeln, die aus Schaden entstanden sind

- **Eine einzige Vercel-Funktion.** Der Hobby-Tarif erlaubt zwölf pro Deployment, je
  Endpunkt eine Datei wären neunzehn. `vercel.json` leitet alles auf `api/index.js` um.
  Neue Endpunkte kommen nach `server/routen.js`, nicht als neue Datei in `api/`.
- **Vercel-Cron höchstens täglich.** Der Hobby-Tarif lehnt häufigere Zeitpläne ab und das
  Deployment scheitert. Den Viertelstundentakt gibt cron-job.org (`docs/START.md`, Schritt 8); der
  Server meldet deshalb höchstens einmal am Tag und überspringt gerade gesammelte Konten.
- **`CRON_SECRET` nur ASCII.** Vercel schickt den Wert als HTTP-Header; ein Umlaut darin
  lässt schon den Build scheitern. Für die anderen Geheimnisse gilt das nicht.
- **`TOKEN_ENC_KEY` ist nicht ersetzbar.** Er verschlüsselt die Zugangsdaten der Nutzer.
  Ein neuer Wert macht alle hinterlegten Schlüssel unlesbar; `getConfig` schluckt den
  Entschlüsselungsfehler und meldet die Quelle dann als „nicht eingerichtet".
- **Formularzustand vollständig aus dem Eintrag laden.** Der Server übernimmt aus dem
  Formular nur, was tatsächlich darin steht. Ein Feld, das die Oberfläche nicht einliest,
  lässt sich nie wieder abstellen und wirkt wie ein Geisterzustand.
- **Geheimnisse gehen nie an die App zurück.** Handler geben „gesetzt" und die letzten
  Zeichen aus, mehr nicht. `/api/health` nennt Namen und ja/nein, nie Werte.

## DSGVO-Nachzug (17.09.2026)

Die Datenschutzerklärung (`client/public/datenschutz.html`) war gut aufgebaut, stand
aber voller Platzhalter — „[Name des Betreibers]", „[EU-Region eintragen]" — und
nannte Telegram und ntfy als Auftragsverarbeiter mit Art.-28-Vertrag. Beides gibt
es nicht: Telegram (VAE) bietet keinen AVV an, ntfy.sh auch nicht. Sie sind jetzt
als vom Nutzer gewählte **Empfänger** beschrieben (wie eine E-Mail-Adresse), mit
Hinweis auf den fehlenden Angemessenheitsbeschluss bei Telegram. Betreiberdaten
eingetragen, Regionen benannt (Vercel fra1, Supabase Frankfurt laut `docs/START.md`
— **prüfen, ob das Projekt wirklich dort liegt**), neue Seite `impressum.html`
(§ 5 ECG), Link in der Fußzeile der App.

## Sprache und Stil

Bezeichner, Kommentare und Oberfläche sind deutsch, auch in neuem Code. Kommentare
erklären das Warum, nicht das Was. Fehlermeldungen richten sich an den Betreiber und
sagen, was zu tun ist, nicht nur was kaputt ist.

Commit-Nachrichten beschreiben in der Betreffzeile die Wirkung, nicht die Änderung, und
begründen im Text, warum es nötig war.

## Doku

`README.md` erklärt Aufbau und alle Quellen, `docs/START.md` führt Schritt für Schritt
durch das Aufsetzen auf Vercel samt der bekannten Stolperstellen, `docs/APP-STORE.md`
durch die native App.
