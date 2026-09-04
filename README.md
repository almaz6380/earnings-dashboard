# Einnahmen-Dashboard

Privates Dashboard, das alle App-Einnahmen an einer Stelle in Euro zeigt:

| Quelle | Was | Zugang |
|---|---|---|
| RevenueCat | Abo-Umsatz (Schätzung vor Store-Abzug), MRR, aktive Abos; mehrere Projekte möglich | Secret-API-Key v2 je Projekt |
| AdMob | Werbeeinnahmen pro Tag | Google-Login |
| AdSense | Web-Werbung pro Tag + offenes Guthaben | Google-Login |
| Google Play | tatsächliche Auszahlung pro Monat (Earnings-Bericht) | Google-Login |
| App Store | Tageserlöse (Sales) + tatsächliche Auszahlung je Fiskalmonat | API-Key mit Rolle Finance |
| Wise, PayPal | Kontostände | API-Token bzw. Client-ID/Secret |
| Wechselkurse | EZB-Kurse über frankfurter.app | keiner |
| Telegram / ntfy | tägliche Zusammenfassung aufs Handy | Bot-Token bzw. Topic |

Jede Quelle ist optional. Was fehlt, steht im Tab „Quellen“.

Technik: Node/Express lokal, auf Vercel als Serverless-Funktionen (`api/`), React + Vite + recharts
(`client/`), Speicher lokal als JSON in `data/` oder in der Supabase-Tabelle `earnings_kv`.

## Schnellstart lokal

```bash
npm install
cp .env.example .env      # ausfüllen, mindestens DASHBOARD_PASSWORD, SESSION_SECRET, TOKEN_ENC_KEY
npm run dev               # http://localhost:5173
npm test                  # Parser, Auth, Verschlüsselung, Zusammenfassung
npm run collect           # ein Sammellauf ohne Server
```

Zufallsstrings für die Secrets: `openssl rand -hex 32`.

## Deploy auf Vercel

1. Neues Vercel-Projekt aus diesem Repo, Root = Projektordner. `vercel.json` bringt Region, Build und Cron mit.
2. Supabase: `supabase.sql` einmal im SQL-Editor ausführen (die Tabelle darf neben anderen Tabellen liegen).
3. Env-Variablen in Vercel eintragen (alle aus `.env.example`, die du nutzt). `PUBLIC_URL` ist optional, die App leitet sie sonst aus der Anfrage ab.
4. Deploy. Danach Env-Änderungen wirken erst nach erneutem Deploy.
5. Cron: `vercel.json` ruft `/api/collect` täglich um 06:00 UTC auf. Vercel schickt dabei `Authorization: Bearer <CRON_SECRET>`,
   also `CRON_SECRET` setzen. Alternativ cron-job.org auf `https://<app>/api/collect?secret=<CRON_SECRET>`.

## Quellen einrichten

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
   Die genaue URI zeigt das Dashboard im Tab „Quellen“ unter „Google verbinden“.
   → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
5. Im Dashboard, Tab „Quellen“ → **Google verbinden**. Der Refresh-Token wird verschlüsselt gespeichert.

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
- Telegram: Bot bei @BotFather anlegen, dem Bot schreiben, Chat-ID über `https://api.telegram.org/bot<TOKEN>/getUpdates`.
  → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- ntfy: App installieren, Topic abonnieren (lang und zufällig, ist das einzige „Passwort“). → `NTFY_TOPIC`.

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

## Sicherheit

- Dashboard hinter Passwort (`DASHBOARD_PASSWORD`), Cookie HttpOnly + signiert (`SESSION_SECRET`), 30 Tage gültig,
  5 Fehlversuche → 15 Minuten Sperre.
- Google-Refresh-Token liegt AES-256-GCM-verschlüsselt (`TOKEN_ENC_KEY`) im Speicher. Ändert sich der Schlüssel,
  einmal neu verbinden.
- Alle Keys nur als Umgebungsvariablen. `.env` und `data/` sind gitignored. Nie Keys in Chats oder Commits.
- Alle Zugriffe sind lesend. Das Dashboard kann nichts auszahlen oder ändern.

## Aufbau

```
server/   Express (lokal) + Handler, die auch als Vercel-Funktionen laufen
  sources/   eine Datei je Quelle: configured() + fetchData()
  collect.js Sammellauf, summary.js Kennzahlen, notify.js Meldung, fx.js Kurse
  auth.js Passwort/Cookie, crypto.js Token-Verschlüsselung, google/oauth.js Login
api/      Vercel-Einstiege (nur Re-Exports)
client/   React-Dashboard: Übersicht, Verlauf, Quellen
```
