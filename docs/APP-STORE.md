# Einnahmen als App im App Store und bei Google Play

Die native App ist der bestehende React-Client, verpackt mit [Capacitor](https://capacitorjs.com) 8.
Sie liegt in `client/ios` und `client/android`, spricht mit dem eigenen Server (Vercel) über
`Authorization: Bearer` statt Cookie und bringt Icon, Splash, Datenschutzseite und Store-Texte mit.

## Was schon im Repo fertig ist

| Teil | Wo | Stand |
|---|---|---|
| Native Projekte iOS + Android | `client/ios`, `client/android` | angelegt, Icons und Splash generiert, dunkles Design, nur hochkant (iPhone) |
| Token-Anmeldung + CORS für die App | `server/auth.js`, `server/cors.js` | fertig, getestet (`npm test`) |
| Login mit Server-Adresse in der App | `client/src/App.jsx`, `client/src/api.js` | fertig |
| Neu laden beim Zurückkehren, Android-Zurück-Taste, Statusleiste, Splash | `client/src/native.js` | fertig |
| Safe Areas (Notch, Home-Indikator) | `client/src/styles.css`, `index.html` | fertig |
| PWA-Manifest + Web-Icons | `client/public/` | fertig (Homescreen im Browser funktioniert auch ohne Store) |
| Datenschutzerklärung | `client/public/datenschutz.html` → `https://<domain>/datenschutz.html` | fertig, Pflicht-URL für beide Stores |
| Store-Texte, Review-Hinweise, Datenschutz-Fragebögen | `store/listing.md` | fertig zum Kopieren |
| Versionen setzen | `npm run app:version -- 1.0.1` | setzt versionName/versionCode und MARKETING_VERSION/CURRENT_PROJECT_VERSION |
| CI | `.github/workflows/android.yml`, `ios.yml` | Debug-APK bei jedem Push, signiertes AAB bei Tag `v*`, iOS-Kompilierprüfung |

## Was nur du machen kannst (Checkliste)

### 0. Konten und Kosten
- [ ] **Apple Developer Program**: 99 USD/Jahr, https://developer.apple.com/programs/enroll/. Freischaltung dauert 1–2 Tage.
- [ ] **Google Play Console**: einmalig 25 USD, https://play.google.com/console/signup. Neue Privatkonten müssen seit 2024 vor
      dem ersten Produktions-Release einen **geschlossenen Test mit 12 Testern über 14 Tage** durchlaufen.
- [ ] Einen Mac mit Xcode 16+ (für iOS gibt es keinen Weg daran vorbei; für Android reicht jedes System mit Android Studio).

### 1. Bundle-ID festlegen (vor dem ersten Upload, danach nicht mehr änderbar)
Aktuell: `app.einnahmen.dashboard`. Wenn du eine eigene Domain-basierte ID willst (z. B. `de.deinname.einnahmen`):
```bash
# in client/capacitor.config.json "appId" ändern, dann Plattformen neu erzeugen:
cd client && rm -rf ios android && npx cap add ios && npx cap add android && npm run assets
```
und die Anpassungen aus dem Commit „Native App" (Info.plist, styles.xml, AndroidManifest) erneut anwenden.

### 2. Server vorbereiten
- [ ] Aktuellen Stand auf Vercel deployen (die Token-Anmeldung braucht den neuen Server).
- [ ] Prüfen: `https://<domain>/datenschutz.html` ist erreichbar.
- [ ] Optional `APP_ORIGINS` setzen, falls die App gegen eine zusätzliche Domain sprechen soll.
- [ ] Für die Store-Prüfung eine **Demo-Instanz** anlegen (zweites Vercel-Projekt aus demselben Repo, eigenes
      `DASHBOARD_PASSWORD`, Quellen leer). Prüfer brauchen Adresse + Passwort, siehe `store/listing.md`.

### 3. Lokal bauen und testen
```bash
npm install
npm run app:icons        # nur nötig, wenn du die SVGs in client/assets geändert hast
npm run app:ios          # baut den Client, synchronisiert, öffnet Xcode
npm run app:android      # dito für Android Studio
```
- [ ] In Xcode: Signing & Capabilities → Team auswählen (Automatic Signing).
- [ ] Auf echtem iPhone und Android-Gerät: Anmelden mit Server-Adresse, alle vier Tabs, Ziehen zum Aktualisieren,
      App in den Hintergrund und zurück (lädt neu), Abmelden, Android-Zurück-Taste.
- [ ] „Google verbinden" öffnet den Browser (der OAuth-Rückweg landet im Web-Dashboard; das ist so gewollt).

### 4. Screenshots und Grafiken
- [ ] iPhone 6,9" und 6,5", iPad 13" (Simulator, ⌘S). Google Play: mindestens 2 Telefon-Screenshots + Feature-Grafik 1024×500.
- [ ] Motive und Größen stehen in `store/listing.md`.

### 5. iOS einreichen
- [ ] App Store Connect → Meine Apps → **+** → Name „Einnahmen", Bundle-ID, SKU (z. B. `einnahmen-1`).
- [ ] Xcode: Product → **Archive** → Distribute → App Store Connect → Upload. Alternativ Xcode Cloud aus Xcode heraus einrichten.
- [ ] TestFlight: erst selbst installieren, dann einreichen.
- [ ] Store-Eintrag ausfüllen (Texte aus `store/listing.md`), App-Datenschutz: **„Daten werden nicht erfasst"**.
- [ ] Review-Hinweise mit Demo-Server + Passwort. Ohne funktionierenden Testzugang folgt eine Ablehnung (2.1).
- [ ] Altersfreigabe 4+, Preis kostenlos, Verfügbarkeit nach Wunsch (z. B. nur DACH).

**Risiko, offen gesagt:** Apple lehnt Apps, die nur für den Entwickler selbst nützlich sind, gelegentlich nach
Richtlinie 4.2 (Mindestfunktionalität) oder 3.2 ab. Das ist mit dem Selbst-Hosting-Argument („Client für einen
Open-Source-Server, jeder Nutzer betreibt sein eigenes Backend") normalerweise zu entkräften; die Formulierung steht in
`store/listing.md`. Falls es doch nicht klappt, sind **TestFlight** (bis 10.000 Tester, 90 Tage je Build) oder die
**Unlisted App Distribution** (App nur per Link, Antrag bei Apple) die Alternativen ohne öffentliche Listung.

### 6. Android einreichen
- [ ] Upload-Keystore erzeugen und **sicher wegsichern** (geht er verloren, ist die App nicht mehr aktualisierbar):
      ```bash
      keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
      ```
- [ ] Entweder lokal: Android Studio → Build → Generate Signed Bundle (AAB) mit diesem Keystore,
      oder CI: die vier Secrets aus `android.yml` im Repo hinterlegen und ein Tag `v1.0.0` pushen → Artefakt `einnahmen-release-aab`.
- [ ] Play Console → App erstellen → Play App Signing akzeptieren → AAB hochladen (erst **interner Test**).
- [ ] Store-Eintrag, Datensicherheits-Formular („keine Daten erhoben"), Inhaltseinstufung, Zielgruppe (18+ oder „nicht für Kinder").
- [ ] Geschlossener Test (12 Tester, 14 Tage, nur bei neuen Privatkonten) → Produktion beantragen.

### 7. Jede weitere Version
```bash
npm run app:version -- 1.0.1     # Version hoch, Build-Nummer +1 in beiden Projekten
git commit -am "App 1.0.1" && git tag v1.0.1 && git push --tags
npm run app:ios                  # Archive + Upload in Xcode
```
Der Server ist abwärtskompatibel: alte App-Versionen laufen weiter, weil nur `/api/*` mit Token gesprochen wird.

## Wie die App technisch funktioniert

- **Client in der App, API auf dem Server.** Der gebaute Client (`client/dist`) wird bei `cap sync` in die App kopiert.
  Netzwerkanfragen gehen an die eingegebene Server-Adresse (`client/src/api.js`).
- **Anmeldung:** `POST /api/login` mit `{ password, token: true }` liefert dasselbe signierte Token, das im Browser im
  HttpOnly-Cookie liegt. Die App speichert es in den Capacitor Preferences und schickt es als `Authorization: Bearer`.
  `server/auth.js` akzeptiert beides. Abmelden löscht das Token; ein 401 schickt zur Anmeldung zurück.
- **CORS:** Die App-Origins (`capacitor://localhost`, `https://localhost`) sind in `server/cors.js` freigeschaltet, alle
  Handler sind mit `withCors` umhüllt, OPTIONS-Preflights werden beantwortet. Weitere Origins per `APP_ORIGINS`.
- **Google-OAuth:** Der Rückweg des Logins landet auf dem Web-Dashboard. Die App öffnet dafür den System-Browser; die
  Verbindung wird serverseitig gespeichert und gilt danach überall.
- **Nur HTTPS:** iOS (ATS) und Android blocken Klartext; die Login-Maske akzeptiert nur `https://`.
- **Sicherheit auf dem Gerät:** Preferences liegen im App-Container, Android-Backup ist abgeschaltet
  (`allowBackup="false"`), damit das Token nicht in die Cloud wandert.
- **Kein Tracking, keine Push-Berechtigung** – die tägliche Meldung läuft weiter über Telegram/ntfy vom Server.

## Nützliche Befehle

| Befehl | Zweck |
|---|---|
| `npm run app:sync` | Client bauen und in beide nativen Projekte kopieren |
| `npm run app:ios` / `npm run app:android` | dazu Xcode bzw. Android Studio öffnen |
| `npm run app:icons` | Icons und Splash aus `client/assets/*.svg` neu erzeugen |
| `npm run app:version -- 1.2.0 [build]` | Version und Build-Nummer setzen |
| `cd client/android && ./gradlew assembleDebug` | Debug-APK ohne Android Studio |
