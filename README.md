# Einnahmen

Dienst und App, die alle App-Einnahmen an einer Stelle in einer Währung zeigen. Jeder legt ein Konto an,
verbindet seine eigenen Quellen und sieht nur seine Zahlen:

| Quelle | Was | Zugang |
|---|---|---|
| RevenueCat | Abo-Umsatz (Schätzung vor Store-Abzug), MRR, aktive Abos; mehrere Projekte möglich | Secret-API-Key v2 je Projekt |
| AdMob | Werbeeinnahmen pro Tag | Google-Login |
| AdSense | Web-Werbung pro Tag + offenes Guthaben | Google-Login |
| Google Play | tatsächliche Auszahlung pro Monat (Earnings-Bericht) | Google-Login |
| App Store | Tageserlöse (Sales) + tatsächliche Auszahlung je Fiskalmonat | API-Key mit Rolle Finance |
| Wise, PayPal | Kontostände | API-Token bzw. Client-ID/Secret |
| Wechselkurse | EZB-Kurse über frankfurter.app | keiner |
| Telegram / ntfy | tägliche Zusammenfassung aufs Handy | Chat-ID bzw. Topic im Konto |

Jede Quelle ist optional und wird im Tab „Einrichten" verbunden. Zwei Wege führen dorthin:

- **Login:** Google (deckt AdMob, AdSense und Play ab) und RevenueCat. Ein Klick, kein Abtippen. Mehrere Konten je
  Dienst sind möglich – etwa AdMob privat und die Play Console über die Firma.
- **Schlüssel:** App Store Connect, Wise und PayPal. Diese Anbieter haben keinen offenen Login für Fremd-Apps;
  dort erzeugt man einen Lese-Schlüssel und trägt ihn ein. Wo es geht, sucht die App die zugehörigen IDs selbst
  (AdMob- und AdSense-Konten, RevenueCat-Projekte, Wise-Profile).

Die Zugangsdaten liegen AES-verschlüsselt auf dem Server, werden nie angezeigt und nur lesend genutzt.

Technik: Node/Express lokal, auf Vercel eine einzige Serverless-Funktion (`api/index.js`),
die alle `/api/...`-Adressen aus `server/routen.js` bedient – der Hobby-Tarif erlaubt nur
12 Funktionen pro Deployment. Oberfläche: React + Vite + recharts
(`client/`). Speicher wahlweise Redis (in Vercel mit zwei Klicks dazubuchbar), eine
Supabase-Tabelle oder lokale JSON-Dateien - je nachdem, was in der Umgebung gesetzt ist.
Derselbe Client läuft als native App für iPhone und Android (Capacitor, `client/ios`, `client/android`).
Alles zum Betrieb als öffentlicher Dienst und zur Store-Einreichung: [docs/APP-STORE.md](docs/APP-STORE.md).

## Schnellstart lokal

```bash
npm install
cp .env.example .env      # ausfüllen, mindestens SESSION_SECRET, TOKEN_ENC_KEY
npm run dev               # http://localhost:5173 -> Konto erstellen, Quellen eintragen
npm test                  # Parser, Auth, Konten, Verschlüsselung, Zusammenfassung
npm run collect           # Sammellauf für alle Konten ohne Server (node server/cli.js collect [email])
```

Altes Ein-Nutzer-Dashboard (Keys in `.env`) übernehmen: `node server/cli.js migrate deine@mail.de <passwort>`.

Zufallsstrings für die Secrets: `openssl rand -hex 32`.

## Deploy auf Vercel

Schritt für Schritt mit allen Klickpfaden: **[docs/START.md](docs/START.md)**. Kurzfassung:

1. Neues Vercel-Projekt aus diesem Repo, Root = Projektordner. `vercel.json` bringt Region, Build und Cron mit.
2. Supabase: `supabase.sql` einmal im SQL-Editor ausführen (die Tabelle darf neben anderen Tabellen liegen).
3. Env-Variablen in Vercel eintragen (alle aus `.env.example`, die du nutzt). `PUBLIC_URL` ist optional, die App leitet sie sonst aus der Anfrage ab.
   Der Google-OAuth-Client gehört dem Betreiber und gilt für alle Nutzer (Zustimmungsbildschirm „In production", Scopes verifizieren lassen).
4. Deploy. Danach Env-Änderungen wirken erst nach erneutem Deploy.
5. Cron: `vercel.json` ruft `/api/collect` täglich um 06:00 UTC auf. Vercel schickt dabei `Authorization: Bearer <CRON_SECRET>`,
   also `CRON_SECRET` setzen. Alternativ cron-job.org auf `https://<app>/api/collect?secret=<CRON_SECRET>`.

## Native App (App Store / Google Play)

```bash
npm run app:ios        # Client bauen, synchronisieren, Xcode öffnen
npm run app:android    # dito mit Android Studio
npm run app:version -- 1.0.1   # Version + Build-Nummer in beiden Projekten setzen
```

Die Adresse des Dienstes wird beim Bauen eingebaut (`client/.env.local`, `VITE_SERVER_URL`); ohne sie fragt die App
danach (Selbst-Hosting). Nutzer registrieren sich in der App und sprechen danach per Bearer-Token mit `/api/*`.
Store-Texte in `store/listing.md`, Datenschutzerklärung und Nutzungsbedingungen unter `/datenschutz.html` und
`/nutzungsbedingungen.html` (Platzhalter füllen). Checkliste für Konten, Google-Verifizierung, Signierung,
Screenshots und Einreichung: [docs/APP-STORE.md](docs/APP-STORE.md).

## Quellen einrichten

Alle Werte werden im Tab „Einrichten" eingetragen (nicht mehr als Umgebungsvariablen). Die Namen unten sind die
Feldbezeichnungen in der App; beim Betreiber bleiben nur die OAuth-Clients (`GOOGLE_CLIENT_ID`/`_SECRET` und
optional `REVENUECAT_CLIENT_ID`/`_SECRET`). Je Quelle sind mehrere Einträge möglich.

### RevenueCat
Dashboard → Projekt → Project settings → API keys → **+ New secret API key** mit Berechtigung
*Charts & Metrics: Read*. Die Projekt-ID steht in der URL des Projekts
(`app.revenuecat.com/projects/<ID>/…`). → `REVENUECAT_API_KEY`, `REVENUECAT_PROJECT_ID`.

**Mehrere Projekte:** Ein Secret-Key gilt immer nur für ein Projekt. Für jedes weitere Projekt
einen eigenen Schlüssel erzeugen und als Paar mit Nummer eintragen: `REVENUECAT_API_KEY_2` +
`REVENUECAT_PROJECT_ID_2`, dann `_3` usw. bis `_5`. Optional je Projekt ein Anzeigename
(`REVENUECAT_LABEL`, `REVENUECAT_LABEL_2`, …). Das Dashboard zeigt die Summe und darunter
jede App einzeln.

### Google (ein Login für AdMob, AdSense, Play)
1. [Google Cloud Console](https://console.cloud.google.com) → Projekt anlegen.
2. APIs aktivieren: **AdMob API**, **AdSense Management API**, **Cloud Storage JSON API**.
3. OAuth-Zustimmungsbildschirm: Typ *Extern*, dich selbst als Testnutzer eintragen.
   Wichtig: Im Status *Testing* läuft der Refresh-Token nach 7 Tagen ab. Danach auf **In production** stellen
   (kein Review nötig, solange nur du die App nutzt). Dann bleibt die Verbindung dauerhaft.
4. Anmeldedaten → OAuth-Client-ID → *Webanwendung*. Autorisierte Weiterleitungs-URIs:
   `https://<app>.vercel.app/api/google/callback` und `http://localhost:3001/api/google/callback`.
   Die genaue URI ist `https://<domain>/api/google/callback`.
   → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. In der App, Tab „Einrichten" → **Google verbinden**. Der Refresh-Token wird je Konto verschlüsselt gespeichert.

Dazu je Dienst:
- **AdMob:** Publisher-ID (`pub-…`) aus AdMob → Einstellungen → Kontoinformationen → `ADMOB_PUBLISHER_ID`.
- **AdSense:** Publisher-ID (`pub-…`) → `ADSENSE_ACCOUNT_ID`. Weglassen, wenn du kein AdSense nutzt.
- **Google Play:** Play Console → Berichte herunterladen → Finanzberichte → **Cloud Storage-URI kopieren**.
  Nur den Bucket-Namen (`pubsite_prod_rev_…`) in `PLAY_GCS_BUCKET`. Dein Konto braucht in der Play Console
  „Finanzdaten ansehen“ mit Umfang *Global*.

### App Store Connect
Nutzer und Zugriff → Integrationen → App Store Connect API → Schlüssel erzeugen mit Rolle **Finance**
(der Schlüssel muss ein *Team*-Schlüssel sein, kein individueller). Die `.p8`-Datei gibt es nur einmal zum Download.
- `ASC_KEY_ID`, `ASC_ISSUER_ID` (steht über der Schlüsselliste)
- `ASC_PRIVATE_KEY`: Inhalt der .p8 base64-kodiert: `base64 -i AuthKey_XXXX.p8 | tr -d '\n'`
- `ASC_VENDOR_NUMBER`: Zahlungen und Finanzberichte → oben links die Vendor-Nummer

### Wise
Einstellungen → API-Token → *Read only*. Profil-ID über `GET https://api.wise.com/v2/profiles` mit dem Token.
→ `WISE_API_TOKEN`, `WISE_PROFILE_ID`.

### PayPal
[developer.paypal.com](https://developer.paypal.com) → Apps & Credentials → **Live** → App anlegen, unter
Features **Transaction Search** aktivieren. → `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live`.

### Tägliche Meldung
- Telegram: der Betreiber legt einen Bot bei @BotFather an (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME`); jeder Nutzer
  schreibt dem Bot und trägt seine Chat-ID (via @userinfobot) im Tab „Konto" ein.
- ntfy: App installieren, Topic abonnieren (lang und zufällig, ist das einzige „Passwort") und im Tab „Konto" eintragen.

Die Meldung geht nur beim Cron-Lauf raus, nicht beim Klick auf „Aktualisieren“.

## Wie die Zahlen zustande kommen

- **Summe** = Werbung (AdMob + AdSense) + Abo-Umsatz. Für den Abo-Umsatz gilt RevenueCat, wenn es Tageswerte liefert,
  sonst die Store-Erlöse (App-Store-Sales + Play). So zählt nichts doppelt.
- **Tatsächliche Auszahlungen** kommen aus dem Play-Earnings-Bericht (Kalendermonat) und dem Apple-Finanzbericht
  (Fiskalmonat, etwa 5 Tage nach Monatsende). Bei AdMob gibt es kein Guthaben-Feld; das offene Guthaben ist die
  Summe seit der letzten Auszahlung.
- **Umrechnung** mit dem aktuellen EZB-Kurs (Tages-Cache). Währungen, die die EZB nicht führt, werden angezeigt,
  aber nicht summiert.
- **Verzug:** AdMob und AdSense 1–2 Tage, Apple Sales 1 Tag, Play und Apple Finance monatlich.
- **Verlauf:** Tageswerte 2 Jahre, Kontostand-Snapshots 1 Jahr, alles in `history` im Speicher.
- **Aufschlüsselung nach Apps** (Tab „Apps“): AdMob liefert sie je App, RevenueCat je Projekt, App Store Connect
  je Titel, Google Play je Produkt. AdSense bleibt außen vor – das sind Webseiten, keine Apps. Gleiche App-Namen
  aus verschiedenen Quellen (Werbung und Abos derselben App) landen in einer Zeile. Gezählt wird nur, was auch in
  die Gesamtsumme geht, damit nichts doppelt erscheint.

## Sicherheit

- Konten mit E-Mail + Passwort (scrypt-Hash, mind. 10 Zeichen), Sitzung als signiertes Token (`SESSION_SECRET`),
  30 Tage gültig, Passwortwechsel macht alte Sitzungen ungültig. 5 Fehlversuche je IP+E-Mail → 15 Minuten Sperre,
  10 Registrierungen je IP und 15 Minuten. Konto-Löschung in der App entfernt alles.
- Zugangsdaten der Quellen und Google-Refresh-Tokens liegen je Konto AES-256-GCM-verschlüsselt (`TOKEN_ENC_KEY`) im
  Speicher und werden nie im Klartext zurückgegeben. Ändert sich der Schlüssel, müssen alle neu eintragen.
- Betreiber-Secrets nur als Umgebungsvariablen. `.env` und `data/` sind gitignored. Nie Keys in Chats oder Commits.
- Alle Zugriffe sind lesend. Das Dashboard kann nichts auszahlen oder ändern.
- Native App: dasselbe Token als `Authorization: Bearer`, gespeichert in den App-Preferences (kein Cloud-Backup),
  CORS nur für die App-Origins (`server/cors.js`, weitere über `APP_ORIGINS`).

## Aufbau

```
server/   Express (lokal) + Handler, die auch als Vercel-Funktionen laufen
  sources/   eine Datei je Quelle: configured() + fetchData()
  collect.js Sammellauf, summary.js Kennzahlen, notify.js Meldung, fx.js Kurse
  users.js Konten, quellen.js Einträge je Quelle (+ Migration), auth.js Sitzungen, crypto.js Verschlüsselung
  google/oauth.js Google-Logins je Konto, revenuecat/oauth.js RevenueCat-Login (PKCE)
  cors.js Freigabe für die native App, mail.js Passwort vergessen
api/      Vercel-Einstiege (nur Re-Exports)
client/   React-Client: Übersicht, Apps, Verlauf, Einrichten, Konto
  api.js Server-Adresse + Token (App), native.js Capacitor-Hooks
  ios/ android/ native Projekte (Capacitor), assets/ Icon- und Splash-Quellen
store/    Store-Texte und Review-Hinweise, docs/APP-STORE.md Release-Checkliste
```
