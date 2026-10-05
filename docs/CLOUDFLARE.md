# Betrieb auf Cloudflare (seit 30.09.2026)

## Warum

Am 28.09.2026 hat Vercel den ganzen Hobby-Account pausiert, weil eine andere App ihr
Blob-Kontingent überschritten hatte. Einnahmen war damit tot, obwohl es selbst nichts
verbraucht hatte. Cloudflare Workers Free kostet nichts und sperrt bei Überschreitung
nur den einzelnen Aufruf, nie das Konto.

Die Schlüssel ließen sich von Vercel nicht mitnehmen: Alle bis auf die Redis-Zugänge
waren als „sensitive“ gespeichert und sind auch über die API nicht lesbar. Deshalb ist
`TOKEN_ENC_KEY` neu. Die mit dem alten Schlüssel verschlüsselten Zugangsdaten der Quellen
meldet `getConfig` jetzt als „nicht eingerichtet“, und die Quellen müssen einmal neu
verbunden werden. Konto und Verlauf liegen unverschlüsselt in Redis und sind erhalten.

## Was wo läuft

| Teil | Wo | Warum |
|---|---|---|
| API und Anmeldung | Worker `einnahmen` (`worker/index.js` → `server/routen.js`) | dieselben Handler wie lokal |
| Seiten und App-Dateien | Cloudflare Static Assets aus `client/dist` | wecken den Worker nicht, kosten nichts |
| „Aktualisieren“ in der App | Worker, **nur leichte Quellen** | Workers Free: 10 ms CPU je Aufruf |
| Geplanter Sammellauf, alle Quellen | GitHub Actions, `.github/workflows/sammeln.yml`, stündlich | App Store und Play brauchen mehr als 10 ms CPU |
| „Liegt Neues vor?“ aus der offenen App | Worker, `/api/stand`, alle 15 s | ein Zeitstempel in einem Speicher-Befehl, damit der kurze Takt tragbar bleibt |
| Speicher | derselbe Upstash-Redis wie vorher | nichts umzuziehen |

Veröffentlicht wird automatisch bei jedem Push auf `main`
(`.github/workflows/deploy.yml`). Der Workflow überträgt die GitHub-Secrets als
Worker-Secrets zu Cloudflare.

## Regeln, die aus dem Umzug entstanden sind

- **Nichts im Worker darf mehr als 10 ms CPU brauchen.** Warten auf Netz zählt nicht,
  Rechnen schon. Deshalb:
  - Passwörter werden mit scrypt N=2048 gehasht (`scrypt-n2048.…`, rund 4 ms).
  - Alte N=16384-Hashes prüft der Worker gar nicht (`NUR_GUENSTIGE_HASHES`). Er meldet stattdessen, dass das Passwort einmal über „Passwort vergessen“ neu zu setzen ist.
  - Quellen mit `meta.schwer` (App Store, Google Play) holt nur der Actions-Lauf.
- **Sammeln nie in den Worker zurückholen.** Ein Cron-Trigger im Worker hätte dieselbe
  10-ms-Grenze.
- **Was die offene App im Takt fragt, muss `/api/stand` bleiben.** Die Oberfläche fragt
  alle 15 Sekunden nach dem Zeitstempel des letzten Laufs (alle 60 Sekunden, wenn der
  Tab nur offen steht) und lädt `/api/state` nur, wenn er sich geändert hat.
  `/api/state` in diesem Takt wäre beides zu teuer: es baut die Zusammenfassung über
  zwei Jahre Verlauf neu (CPU) und liest Verlauf und Kurse mit (Speicher-Befehle).
  `/api/stand` kostet einen einzigen Befehl: Konto und letzter Lauf kommen in einem
  MGET, und geprüft wird nur das signierte Token.
- **Auf GitHubs Zeitplan ist kein Verlass.** Gemessen am 05.10.2026: 17 von rund 90
  geplanten Sammelläufen in fünf Tagen, Abstände von drei bis fünf Stunden, Minuten
  beliebig. GitHub sagt für `schedule` keine Zeit zu und verwirft Läufe unter Last; ein
  kürzerer Zeitplan ändert daran nichts. Frisch bleiben darum nur die leichten Quellen,
  die die offene App selbst holt. Wer App Store und Play verlässlich aktuell braucht,
  muss den Lauf von außen anstoßen — `workflow_dispatch` über die GitHub-API mit einem
  feingranularen Token (Actions: write, nur dieses Repository), etwa aus dem Worker beim
  Tippen auf „Aktualisieren“ oder von cron-job.org. Ohne Token bleibt es beim Zeitplan.
- **Die Kontingente, an denen der Takt hängt.** Cloudflare Workers Free: 100.000 Aufrufe
  am Tag — der 15-Sekunden-Takt braucht höchstens 5.760. Upstash-Redis zählt Befehle:
  ganztägig offene App rund 4.000–8.000 am Tag (Takt plus ein Sammellauf alle 5 Minuten
  mit etwa sieben Befehlen). Beim Ändern der Takte (`SCHNELL_MS`, `RUHE_MS`, `AUTO_MS`
  in `client/src/App.jsx`) zuerst im Upstash-Verbrauch nachsehen, was der Tarif erlaubt.
- **`api/index.js` und `vercel.json` bleiben vorerst liegen.** Sie stören den Worker nicht
  und erlauben den Rückweg, falls Vercel je wieder gebraucht wird.

## GitHub-Secrets

Eintragen unter Settings → Secrets and variables → Actions. Leere Secrets überschreiben
bei Cloudflare nichts.

| Name | Pflicht | Woher |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | ja | Cloudflare → Profil → API-Token („Cloudflare Workers bearbeiten“) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | ja | Vercel → Projekt `einnahmen` → Settings → Environment Variables (Augen-Symbol) |
| `TOKEN_ENC_KEY` | ja | frei gewählt, mindestens 16 Zeichen. **Nie wieder ändern**, sonst sind alle hinterlegten Zugangsdaten unlesbar |
| `SESSION_SECRET` | nein | wird beim ersten Deploy einmalig erzeugt |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | für AdMob, AdSense und Play | Google Cloud → APIs & Dienste → Anmeldedaten |
| `REVENUECAT_CLIENT_ID`, `REVENUECAT_CLIENT_SECRET` | für RevenueCat per Login | RevenueCat → Projekt → Einstellungen |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_NAME` | für die Tagesmeldung | @BotFather → `/mybots` → Bot → API Token |
| `RESEND_API_KEY`, `MAIL_FROM` | für „Passwort vergessen“ | resend.com → API Keys |
| `BASE_CURRENCY`, `SIGNUP`, `APP_ORIGINS`, `PUBLIC_URL`, `CRON_SECRET` | nein | wie in `README.md` |

In Google Cloud und bei RevenueCat müssen die Weiterleitungsadressen auf die neue
Adresse zeigen. Der Deploy-Lauf nennt sie in seiner Zusammenfassung:
`https://einnahmen.<subdomain>.workers.dev/api/google/callback` bzw. `…/api/revenuecat/callback`.
