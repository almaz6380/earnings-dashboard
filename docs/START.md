# Server online bringen

Etwa 30 Minuten, kostet nichts. Eine eigene Domain brauchst du nicht – Vercel vergibt
eine kostenlose Adresse wie `einnahmen.vercel.app`. Die kommt unten überall dort hin,
wo `<adresse>` steht.

## 1. Auf Vercel deployen (10 Minuten)

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden.
2. **Add New → Project**, dieses Repo auswählen, **Deploy**.

Der erste Versuch läuft durch, die App ist aber noch nicht benutzbar – es fehlt der
Speicher. Den holen wir uns im nächsten Schritt.

## 2. Speicher dazubuchen (5 Minuten)

Die App speichert nur Schlüssel und Werte. Dafür reicht ein Redis, und das gibt es
direkt in Vercel – ohne zweites Konto, ohne zweiten Login.

1. Im Vercel-Projekt auf **Storage → Create Database**.
2. Unter den Marketplace-Anbietern **Upstash** wählen, Produkt **Redis**, kostenloser Tarif.
3. Region: eine europäische, etwa Frankfurt.
4. **Connect to Project** – Vercel legt die Zugangsdaten automatisch als Umgebungsvariablen
   an (`KV_REST_API_URL` und `KV_REST_API_TOKEN`). Du musst nichts abtippen.

Fertig. Die App erkennt den Speicher von selbst.

<details>
<summary>Alternative: Supabase, falls du dort noch einen freien Projektplatz hast</summary>

Der Gratis-Tarif erlaubt zwei aktive Projekte, gezählt über alle Organisationen, in denen
du Owner oder Admin bist. Pausierte Projekte zählen nicht mit.

1. Projekt auf [supabase.com](https://supabase.com) anlegen, Region Frankfurt.
2. **SQL Editor → New query**, den Inhalt von `supabase.sql` einfügen, **Run**.
3. **Project Settings → API**: **Project URL** und den **service_role**-Schlüssel kopieren.
4. In Vercel als `SUPABASE_URL` und `SUPABASE_SERVICE_KEY` eintragen.

Der service_role-Schlüssel darf nur auf den Server. Nie in die App, nie in einen Chat.
Ist beides gesetzt, hat Redis Vorrang.
</details>

## 3. Geheimnisse setzen (5 Minuten)

Drei Zufallsstrings erzeugen, im Terminal:

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # TOKEN_ENC_KEY
openssl rand -hex 32   # CRON_SECRET
```

In Vercel unter **Settings → Environment Variables** eintragen:

| Name | Wert |
|---|---|
| `SESSION_SECRET` | erster Zufallsstring |
| `TOKEN_ENC_KEY` | zweiter Zufallsstring |
| `CRON_SECRET` | dritter Zufallsstring |
| `PUBLIC_URL` | deine Vercel-Adresse, ohne Schrägstrich am Ende |

`TOKEN_ENC_KEY` verschlüsselt die Zugangsdaten deiner Nutzer. Änderst du ihn später,
müssen alle ihre Schlüssel neu eintragen. Also einmal erzeugen und sicher aufbewahren.

Danach **Deployments → Redeploy.** Umgebungsvariablen greifen erst nach einem neuen Deploy.

## 4. Prüfen

`https://<adresse>` öffnen. Es muss die Anmeldemaske kommen. Leg dir dort ein Konto an.

Dass die Registrierung klappt, ist schon der halbe Beweis: Vercels Dateisystem ist
schreibgeschützt, ohne Datenbank käme hier ein Fehler.

Welche Datenbank es geworden ist, sagt dir – im selben Browser, angemeldet –
`https://<adresse>/api/status`. Suche darin `"storage"`: dort muss `redis` stehen
(oder `supabase`). Steht dort `lokal (data/)`, hat der Server die Zugangsdaten nicht
gesehen – dann fehlt ein Redeploy oder eine Variable.

## 5. Google-Login einrichten (15 Minuten + Wartezeit)

Nur nötig für AdMob, AdSense und Google Play. RevenueCat, App Store, Wise und PayPal
laufen ohne.

1. [Google Cloud Console](https://console.cloud.google.com) → neues Projekt.
2. **APIs & Dienste → Bibliothek**: AdMob API, AdSense Management API und Cloud Storage JSON API aktivieren.
3. **OAuth-Zustimmungsbildschirm**: Typ *Extern*, App-Name „Einnahmen", Support-E-Mail,
   Startseite `https://<adresse>`, Datenschutz `https://<adresse>/datenschutz.html`.
4. **Anmeldedaten → OAuth-Client-ID → Webanwendung.**
   Autorisierte Weiterleitungs-URI: `https://<adresse>/api/google/callback`
5. Client-ID und Secret als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` in Vercel eintragen, neu deployen.
6. Im Zustimmungsbildschirm auf **In production** stellen und die **Verifizierung beantragen**.

Zur Verifizierung: Die drei Berechtigungen gelten bei Google als sensibel. Bis zur Freigabe
können sich nur bis zu 100 Konten verbinden, die du selbst als Testnutzer einträgst.
Google fragt nach einem Demo-Video und einer Begründung je Berechtigung. **Das dauert
2 bis 6 Wochen** – deshalb früh beantragen. Die App funktioniert währenddessen ganz normal,
nur eben für einen kleinen Kreis.

## 6. Deine bisherigen Daten übernehmen (2 Minuten)

Lokal, mit den Vercel-Werten in einer `.env`:

```bash
node server/cli.js migrate deine@mail.de <passwort>
```

Das legt ein Konto an und schiebt deine alten Zugangsdaten und deinen Verlauf hinein.
Danach kannst du die Quellen-Variablen aus der Umgebung löschen.

## 7. Optional

| Was | Wozu | Wie |
|---|---|---|
| `RESEND_API_KEY`, `MAIL_FROM` | „Passwort vergessen" per E-Mail | Konto bei [resend.com](https://resend.com) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME` | tägliche Meldung per Telegram | Bot bei @BotFather anlegen |
| `REVENUECAT_CLIENT_ID`, `REVENUECAT_CLIENT_SECRET` | RevenueCat per Login statt Schlüssel | bei support@revenuecat.com anfragen |
| `SIGNUP=closed` | keine neuen Registrierungen | in Vercel setzen |

ntfy braucht nichts vom Betreiber – Nutzer tragen ihr Topic selbst im Konto ein.

## Läuft es?

- `https://<adresse>` zeigt die Anmeldung ✓
- Konto anlegen klappt ✓
- `https://<adresse>/api/status` zeigt bei `"storage"` `redis` oder `supabase` ✓
- Unter „Einrichten" eine Quelle verbinden, es kommt „Verbindung steht" ✓
- `https://<adresse>/datenschutz.html` ist erreichbar ✓
- Am nächsten Morgen stehen neue Zahlen da (der Cron läuft um 06:00 UTC) ✓

Danach geht es mit [APP-STORE.md](APP-STORE.md) weiter: App bauen, testen, einreichen.
