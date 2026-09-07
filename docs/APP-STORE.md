# Einnahmen als öffentlicher Dienst im App Store und bei Google Play

Die App ist ein Client für den Dienst, den du betreibst: Nutzer legen ein Konto an, tragen ihre eigenen
Zugangsdaten in der App ein, und dein Server ruft für jedes Konto die Berichte ab. Technik: React-Client mit
[Capacitor](https://capacitorjs.com) 8 in `client/ios` und `client/android`, API als Vercel-Funktionen, Speicher in Supabase.

## Was im Repo fertig ist

| Teil | Wo | Stand |
|---|---|---|
| Konten: Registrierung, Login, Passwort ändern/vergessen, Konto löschen | `server/users.js`, `server/auth.js`, `server/handlers/*` | fertig, getestet |
| Zugangsdaten je Konto, AES-verschlüsselt, nie zurückgegeben | `server/users.js` (`setConfig`, `maskConfig`), `server/handlers/config.js` | fertig |
| Quellen lesen aus der Konto-Konfiguration, Google-Login je Konto | `server/sources/*`, `server/google/oauth.js` | fertig |
| Sammellauf je Konto und per Cron über alle Konten mit Zeitbudget | `server/collect.js` | fertig |
| Tägliche Meldung je Konto (ntfy-Topic, Telegram-Chat-ID) | `server/notify.js` | fertig |
| Native App: Login/Registrieren, Einrichten-Formulare, Konto-Tab, Deep Link `einnahmen://` | `client/src/*` | fertig |
| Rechtstexte mit Platzhaltern | `client/public/datenschutz.html`, `nutzungsbedingungen.html` | Platzhalter füllen |
| Store-Texte, Review-Hinweise, Datenschutz-Fragebögen | `store/listing.md` | fertig zum Kopieren |
| Migration deines alten Ein-Nutzer-Dashboards | `node server/cli.js migrate <email> <passwort>` | fertig |
| CI | `.github/workflows/android.yml`, `ios.yml` | Debug-APK je Push, AAB bei Tag `v*`, iOS-Kompilierprüfung |

## Was nur du machen kannst (Checkliste)

### 0. Konten und Kosten
- [ ] **Apple Developer Program**: 99 USD/Jahr, https://developer.apple.com/programs/enroll/ (1–2 Tage Freischaltung).
- [ ] **Google Play Console**: einmalig 25 USD. Neue Privatkonten müssen vor dem ersten Produktions-Release einen
      **geschlossenen Test mit 12 Testern über 14 Tage** durchlaufen.
- [ ] Ein Mac mit Xcode 16+ für den iOS-Build.
- [ ] Eine **Domain** für den Dienst (z. B. `einnahmen.example`) – Prüfer und Nutzer brauchen eine feste Adresse.

### 1. Server aufsetzen (der eigentliche Dienst)
- [ ] Vercel-Projekt aus dem Repo, `supabase.sql` in Supabase ausführen, Domain verbinden.
- [ ] Env setzen: `SESSION_SECRET`, `TOKEN_ENC_KEY`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PUBLIC_URL`.
- [ ] **Google OAuth-Client** (`GOOGLE_CLIENT_ID/SECRET`), Weiterleitungs-URI `https://<domain>/api/google/callback`.
      Für fremde Nutzer muss der Zustimmungsbildschirm auf **„In production"** stehen. Die Scopes `admob.readonly`,
      `adsense.readonly` und `devstorage.read_only` sind *sensitive*: Google verlangt eine **Verifizierung**
      (Datenschutz-URL, Homepage, Demo-Video der OAuth-Nutzung, Begründung je Scope). Dauer 2–6 Wochen. Bis dahin
      können max. 100 Testnutzer verbinden, die du im Zustimmungsbildschirm einträgst.
- [ ] Optional: `RESEND_API_KEY` + `MAIL_FROM` (Passwort vergessen), `TELEGRAM_BOT_TOKEN` + `TELEGRAM_BOT_NAME`.
- [ ] `SIGNUP=closed` setzen, falls du Registrierungen zeitweise stoppen willst.
- [ ] Bestehendes Dashboard übernehmen: alte Quellen-Variablen in `.env` lassen und einmal
      `node server/cli.js migrate deine@mail.de <passwort>` laufen lassen (lokal gegen dieselbe Supabase-DB).
- [ ] Prüfen: `https://<domain>/datenschutz.html` und `/nutzungsbedingungen.html` – **Platzhalter in eckigen
      Klammern füllen** (Name, Anschrift, Kontakt, Supabase-Region, geltendes Recht).
- [ ] Cron: `vercel.json` ruft `/api/collect` täglich auf; das Zeitbudget ist 50 s (Hobby-Plan: max 60 s). Bei vielen
      Konten auf den Pro-Plan wechseln (`maxDuration` 300) oder den Cron mehrmals täglich laufen lassen – jeder Lauf
      nimmt sich die Konten vor, die am längsten warten.

### 2. App bauen
- [ ] `client/.env.local` mit `VITE_SERVER_URL=https://<domain>` anlegen (Vorlage `client/.env.example`).
      Ohne sie fragt die App nach einer Server-Adresse – gut für Selbst-Hoster, nicht für den Store.
- [ ] Bundle-ID festlegen (aktuell `app.einnahmen.dashboard`, nach dem ersten Upload nicht mehr änderbar). Ändern:
      `appId` in `client/capacitor.config.json`, dann `cd client && rm -rf ios android && npx cap add ios && npx cap add android
      && npm run assets` und die Anpassungen aus den Commits „Native App" erneut anwenden (Info.plist: URL-Schema,
      Encryption-Flag, Dark; AndroidManifest: URL-Schema, `allowBackup=false`; styles.xml).
- [ ] `npm install && npm run app:ios` / `npm run app:android`.
- [ ] In Xcode: Signing & Capabilities → Team wählen.
- [ ] Auf Geräten testen: Registrieren, Quelle eintragen, „Google verbinden" (Browser öffnet sich, springt per
      `einnahmen://google` zurück), Aktualisieren, Passwort ändern, Konto löschen, Abmelden.

### 3. Review-Konto mit Beispieldaten
Prüfer sollen keine leere Übersicht sehen. Lokal gegen die Produktions-DB (Env aus Vercel in `.env`):
```bash
node -e "
import('./server/users.js').then(async ({ createUser, ukey }) => {
  const { saveJSON } = await import('./server/store.js');
  const u = await createUser({ email: 'review@<domain>', password: '<Review-Passwort>' });
  const daily = {}; for (let i = 1; i <= 60; i++) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); daily[d] = { EUR: Math.round((20 + Math.random() * 30) * 100) / 100 }; }
  await saveJSON(ukey(u.id, 'history'), { daily: { admob: daily }, payouts: {}, balances: {}, sources: { admob: { status: 'ok', lastOk: new Date().toISOString() } }, apps: {} });
  await saveJSON(ukey(u.id, 'latest'), { collectedAt: new Date().toISOString(), ms: 1, results: { admob: { status: 'ok' } } });
  console.log('ok', u.email);
});"
```

### 4. Screenshots und Grafiken
- [ ] Motive und Größen in `store/listing.md`. Review-Konto verwenden, keine echten Zahlen.

### 5. iOS einreichen
- [ ] App Store Connect → Meine Apps → **+** → Name „Einnahmen", Bundle-ID, SKU.
- [ ] Xcode: Product → **Archive** → Distribute → App Store Connect. Erst TestFlight, dann Einreichen.
- [ ] Store-Eintrag (Texte aus `store/listing.md`), App-Datenschutz-Fragebogen wie dort beschrieben.
- [ ] Review-Hinweise mit Review-Konto. Ohne Testzugang folgt eine Ablehnung (Richtlinie 2.1).
- [ ] Konto-Löschung in der App ist Pflicht (5.1.1 v) – vorhanden, im Tab „Konto".

### 6. Android einreichen
- [ ] Upload-Keystore erzeugen und **sicher wegsichern**:
      `keytool -genkeypair -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
- [ ] Lokal: Android Studio → Build → Generate Signed Bundle; oder CI: die vier Secrets aus `android.yml` hinterlegen und Tag `v1.0.0` pushen.
- [ ] Play Console → App erstellen → AAB in den internen Test → Store-Eintrag, Datensicherheit, Inhaltseinstufung,
      Zielgruppe 18+, **Kontolöschungs-URL** eintragen.
- [ ] Geschlossener Test (12 Tester, 14 Tage) → Produktion.

### 7. Betrieb
- Registrierungen und letzte Läufe: `node server/cli.js users`.
- Sammellauf von Hand: `node server/cli.js collect [email] [--notify]`.
- Neue App-Version: `npm run app:version -- 1.0.1`, committen, Tag pushen, Archive/Upload.
- Der Server ist abwärtskompatibel: ältere App-Versionen sprechen weiter mit `/api/*`.

## Wie es technisch funktioniert

- **Konten** liegen als `user:<id>` im Schlüssel-Wert-Speicher (`earnings_kv`), E-Mail-Index `email:<mail>`,
  Nutzerdaten unter `u:<id>:history|latest|google_tokens`. Passwörter als scrypt-Hash.
- **Sitzung:** Token `<id>.<pwv>.<exp>.<sig>`; `pwv` ist die Passwort-Version, ein Passwortwechsel macht alle
  alten Tokens ungültig. Browser: HttpOnly-Cookie. App: Bearer-Header, Token in den Capacitor Preferences.
- **Zugangsdaten** der Quellen: ein verschlüsseltes JSON je Konto (AES-256-GCM mit `TOKEN_ENC_KEY`). Die API gibt
  nur „gesetzt" plus die letzten vier Zeichen zurück. Ändert sich `TOKEN_ENC_KEY`, müssen alle neu eintragen.
- **Google:** ein OAuth-Client des Betreibers, ein Refresh-Token je Konto. Aus der App: `GET /api/google/link`
  liefert eine Adresse mit Einmal-Ticket, der System-Browser führt den Login durch, der Callback springt per
  `einnahmen://google?google=ok` zurück; im Web landet er auf `/?google=ok#einrichten`.
- **Cron:** `/api/collect` mit `CRON_SECRET` läuft über alle Konten (die am längsten wartenden zuerst) bis das
  Zeitbudget aufgebraucht ist; angemeldet läuft nur das eigene Konto.
- **Rate-Limits:** 5 Fehlversuche je IP+E-Mail → 15 Minuten; 10 Registrierungen je IP und 15 Minuten.
- **CORS** nur für die App-Origins (`server/cors.js`), Body-Limit 256 KB, nur HTTPS in der App.

## Nützliche Befehle

| Befehl | Zweck |
|---|---|
| `npm run app:sync` | Client bauen und in beide nativen Projekte kopieren |
| `npm run app:ios` / `npm run app:android` | dazu Xcode bzw. Android Studio öffnen |
| `npm run app:icons` | Icons und Splash aus `client/assets/*.svg` neu erzeugen |
| `npm run app:version -- 1.2.0 [build]` | Version und Build-Nummer setzen |
| `node server/cli.js users` | Konten auflisten |
| `node server/cli.js migrate <email> <pw>` | altes Ein-Nutzer-Dashboard übernehmen |
