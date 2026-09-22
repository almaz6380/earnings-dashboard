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
Vercel gibt ihn nie wieder heraus, und ein gelöschtes Projekt nimmt ihn mit.

`CRON_SECRET` darf **nur ASCII** enthalten, also keine Umlaute und kein ß. Vercel schickt
den Wert beim Cron-Aufruf als HTTP-Header mit, und ein Umlaut darin lässt schon den Build
scheitern: „contains characters that are not valid in HTTP headers". Die Ausgabe von
`openssl rand -hex` erfüllt das von selbst. Wer sich stattdessen einen Satz ausdenkt, muss
darauf achten. Für `SESSION_SECRET` und `TOKEN_ENC_KEY` gilt die Einschränkung nicht, die
gehen durch keinen Header.

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
   Alle drei, auch wenn du Google Play nicht nutzt: die App fragt den Berechtigungsumfang
   immer komplett ab, und eine abgeschaltete API lässt Google die Anmeldung mit
   `invalid_scope` abweisen. Wer die AdSense-API vergisst, merkt es erst später an einem
   403 beim Abruf, mit genau diesem Hinweis im Text.
3. **OAuth-Zustimmungsbildschirm** (neuerdings „Google Auth Platform", direkt unter
   `console.cloud.google.com/auth/overview`): Typ *Extern*, App-Name „Einnahmen",
   Support-E-Mail, Startseite `https://<adresse>`,
   Datenschutz `https://<adresse>/datenschutz.html`,
   Nutzungsbedingungen `https://<adresse>/nutzungsbedingungen.html`.
   Ohne alle drei Links bleibt **App veröffentlichen** ausgegraut.
4. **Anmeldedaten → OAuth-Client-ID → Webanwendung.**
   Autorisierte Weiterleitungs-URI: `https://<adresse>/api/google/callback`
5. Client-ID und Secret als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` in Vercel eintragen, neu deployen.
   Den Clientschlüssel zeigt Google **nur einmal**, bei der Erstellung. Ist er weg, legst du
   auf der Client-Seite über **Add secret** einen neuen an; der alte bleibt daneben gültig,
   bis du ihn deaktivierst. Kommt beim Verbinden „The provided client secret is invalid",
   hat der Zustimmungsbildschirm ja funktioniert - dann stimmt die Client-ID und nur der
   Schlüssel ist falsch.
6. Im Zustimmungsbildschirm auf **In production** stellen und die **Verifizierung beantragen**.
   Im Status *Test* verfällt die Verbindung nach sieben Tagen und muss neu hergestellt werden.

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

## 8. Alle 15 Minuten aktualisieren, auch bei geschlossener App

Der Cron in `vercel.json` läuft einmal am Tag um 06:00 UTC und verschickt die tägliche
Meldung. Öfter geht auf dem Hobby-Tarif nicht: Vercel lehnt dort jeden Cron ab, der
häufiger als täglich läuft, und das Deployment scheitert. Den Viertelstundentakt gibt deshalb
ein externer Dienst, zum Beispiel [cron-job.org](https://cron-job.org) (kostenlos):

1. Konto anlegen, **Create cronjob**.
2. URL: `https://<adresse>/api/collect?notify=0`
3. Zeitplan: **Every 15 minutes**.
4. Unter **Advanced → Headers** einen Header `Authorization` mit dem Wert
   `Bearer <CRON_SECRET>` anlegen. Geht auch als `?secret=…` in der URL, dann steht das
   Geheimnis aber in jedem Protokoll, das die Adresse mitschreibt.
5. Methode **POST** (GET geht auch), speichern. In der Verlaufsansicht muss nach spätestens
   15 Minuten ein Aufruf mit Status 200 stehen, die Antwort nennt `gelaufen` und `frisch`.

`notify=0` verhindert, dass der Viertelstunden-Cron meldet; das bleibt Sache des Vercel-Crons um
06:00. Fehlt es, meldet der Server trotzdem höchstens einmal am Tag, dann aber schon kurz
nach Mitternacht UTC mit einem halben Vortag.

Konten, die in den letzten 30 Sekunden schon gesammelt wurden – meist von der offenen
App –, überspringt der Lauf (`COLLECT_MIN_ALTER_MS`). Zwei gleichzeitige Läufe würden
sonst denselben Verlauf laden und sich beim Speichern gegenseitig überschreiben.

Was der Takt kostet, im Blick behalten: jeder Lauf fragt alle eingerichteten Quellen
ab, also 96-mal am Tag je Konto. Öfter als alle 15 Minuten lohnt nicht: die meisten
Quellen melden ohnehin nur tageweise. Vercel zählt das gegen die Funktionslaufzeit
des Tarifs (Dashboard → **Usage**), und Google, Apple, PayPal und Wise haben eigene
Abfragegrenzen. Kommen unter „Einrichten" Fehler wie „429" oder „quota", den Takt bei
cron-job.org auf 30 oder 60 Minuten stellen.

## Läuft es?

- `https://<adresse>` zeigt die Anmeldung ✓
- Konto anlegen klappt ✓
- `https://<adresse>/api/status` zeigt bei `"storage"` `redis` oder `supabase` ✓
- Unter „Einrichten" eine Quelle verbinden, es kommt „Verbindung steht" ✓
- `https://<adresse>/datenschutz.html` ist erreichbar ✓
- Am nächsten Morgen stehen neue Zahlen da (der Cron läuft um 06:00 UTC) ✓
- Mit dem externen Cron: „Stand" oben in der App ist nie älter als etwa 15 Minuten ✓

## Wenn etwas klemmt

**`/api/health`** beantwortet ohne Anmeldung die Frage „was fehlt dem Server noch". Sie
nennt je bekannter Variable ja/nein, ob der Speicher antwortet, und welcher Commit gerade
ausgeliefert wird. Nur Namen, nie Werte. Der letzte Punkt ist mehr wert, als er klingt:
Eine Variable steht im Dashboard und fehlt trotzdem im laufenden Server, wenn seit ihrem
Eintragen kein Deploy lief.

**404 `DEPLOYMENT_NOT_FOUND`** kommt von Vercel, nicht von der App. Unter der geöffneten
Adresse gibt es kein Deployment. Meist ist es eine alte Adresse mit Zufallskette
(`…-abc123-name.vercel.app`), die zu einem einzelnen, inzwischen gelöschten Deployment
gehört. Nimm die feste Adresse aus **Settings → Domains** und tausche Lesezeichen und
Homescreen-Symbol aus.

**Projekt in Vercel gelöscht?** Die Umgebungsvariablen sind endgültig weg, es gibt keinen
Papierkorb. Der Redis-Store überlebt: er hängt am Konto, nicht am Projekt, und lässt sich
im neuen Projekt über **Storage → Connect Store** wieder anbinden. Konten und Verlauf
stehen dann wieder da. Nur wer `TOKEN_ENC_KEY` nicht gesichert hat, muss die Zugangsdaten
aller Quellen einmal neu eintragen - die Konten selbst bleiben.

**Homescreen-Symbol zeigt nach dem Ziehen einen schwarzen Bildschirm?** Es zeigt noch auf
eine alte Adresse. Solange die App im Speicher läuft, fällt das nicht auf; beim ersten
Neuladen landet sie im Leeren. Symbol entfernen, die feste Adresse in Safari öffnen und
über **Teilen → Zum Home-Bildschirm** neu anlegen.

Danach geht es mit [APP-STORE.md](APP-STORE.md) weiter: App bauen, testen, einreichen.
