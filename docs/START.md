# Server online bringen

Etwa 30 Minuten. Kostet nichts: Vercel und Supabase haben Gratis-Stufen, die für diese App reichen.
Eine eigene Domain brauchst du nicht – Vercel vergibt eine kostenlose Adresse.

Am Ende hast du eine Adresse wie `https://einnahmen.vercel.app`. Die kommt unten überall
dort hin, wo `<adresse>` steht.

## 1. Datenbank anlegen (5 Minuten)

1. Auf [supabase.com](https://supabase.com) anmelden, neues Projekt anlegen, Region Frankfurt.
2. Im Projekt links auf **SQL Editor** → **New query**.
3. Den Inhalt von `supabase.sql` aus diesem Repo einfügen und ausführen.
4. Links auf **Project Settings → API**. Dort brauchst du zwei Werte:
   - **Project URL** → das wird `SUPABASE_URL`
   - **service_role secret** → das wird `SUPABASE_SERVICE_KEY`

Der service_role-Schlüssel darf nur auf den Server. Nie in die App, nie in einen Chat.

## 2. Geheimnisse erzeugen (1 Minute)

Drei Zufallsstrings, im Terminal:

```bash
openssl rand -hex 32   # für SESSION_SECRET
openssl rand -hex 32   # für TOKEN_ENC_KEY
openssl rand -hex 32   # für CRON_SECRET
```

`TOKEN_ENC_KEY` verschlüsselt die Zugangsdaten deiner Nutzer. Änderst du ihn später,
müssen alle ihre Schlüssel neu eintragen. Also einmal erzeugen und sicher aufbewahren.

## 3. Auf Vercel deployen (10 Minuten)

1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden.
2. **Add New → Project**, dieses Repo auswählen, **Deploy**.
3. Danach **Settings → Environment Variables**. Diese eintragen:

| Name | Wert |
|---|---|
| `SESSION_SECRET` | erster Zufallsstring |
| `TOKEN_ENC_KEY` | zweiter Zufallsstring |
| `CRON_SECRET` | dritter Zufallsstring |
| `SUPABASE_URL` | aus Schritt 1 |
| `SUPABASE_SERVICE_KEY` | aus Schritt 1 |
| `PUBLIC_URL` | deine Vercel-Adresse, ohne Schrägstrich am Ende |

4. **Deployments → Redeploy.** Umgebungsvariablen greifen erst nach einem neuen Deploy.

Prüfen: `https://<adresse>` öffnen. Es muss die Anmeldemaske kommen. Lege dir dort ein Konto an.

## 4. Google-Login einrichten (15 Minuten + Wartezeit)

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

## 5. Deine bisherigen Daten übernehmen (2 Minuten)

Lokal, mit den Vercel-Werten in einer `.env`:

```bash
node server/cli.js migrate deine@mail.de <passwort>
```

Das legt ein Konto an und schiebt deine alten Zugangsdaten und deinen Verlauf hinein.
Danach kannst du die Quellen-Variablen aus der Umgebung löschen.

## 6. Optional

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
- Unter „Einrichten" eine Quelle verbinden, „Verbinden" sagt „Verbindung steht" ✓
- `https://<adresse>/datenschutz.html` ist erreichbar ✓
- Am nächsten Morgen stehen neue Zahlen da (der Cron läuft um 06:00 UTC) ✓

Danach geht es mit [APP-STORE.md](APP-STORE.md) weiter: App bauen, testen, einreichen.
