# Store-Eintrag (Texte zum Kopieren)

Alle Felder in Deutsch. Für den App Store gilt die Zeichengrenze in Klammern.

## Name
**Einnahmen** (30)

## Untertitel / Kurzbeschreibung
App Store (30): `Alle App-Einnahmen in Euro`
Google Play (80): `Alle App-Einnahmen an einer Stelle: Stores, Werbung, Kontostände – in Euro.`

## Beschreibung (App Store 4000, Google Play 4000)

Einnahmen zeigt dir alle Erlöse deiner Apps an einer Stelle, umgerechnet in Euro:

• RevenueCat: Abo-Umsatz, MRR und aktive Abos, mehrere Projekte zusammengefasst
• AdMob und AdSense: Werbeeinnahmen pro Tag und offenes Guthaben
• App Store und Google Play: Tageserlöse und die tatsächlichen Auszahlungen je Monat
• Wise und PayPal: aktuelle Kontostände
• Wechselkurse der Europäischen Zentralbank

Eine große Zahl für den letzten Tag, farbige Karten je Quelle, die Aufschlüsselung nach Apps und ein Verlauf über zwei Jahre. Zum Aktualisieren einfach nach unten ziehen.

Die App ist das Gegenstück zu deinem eigenen Einnahmen-Server (Open Source, läuft auf Vercel oder jedem Node-Server). Beim ersten Start gibst du die Adresse deines Dashboards und dein Passwort ein. Alle Zugangsdaten zu den Diensten bleiben auf deinem Server, die App liest nur.

Keine Werbung, kein Tracking, keine Konten bei uns.

Was du brauchst: eine laufende Installation des Einnahmen-Dashboards (Anleitung im Quellcode) mit mindestens einer eingerichteten Quelle.

## Schlüsselwörter (App Store, 100 Zeichen, kommagetrennt)
`einnahmen,umsatz,revenuecat,admob,adsense,app store connect,google play,wise,paypal,dashboard,indie`

## Kategorie
App Store: Finanzen (sekundär: Wirtschaft). Google Play: Finanzen.

## Neuerungen in dieser Version (1.0.0)
Erste Version: Übersicht, Apps, Verlauf und Quellen aus dem Web-Dashboard als native App für iPhone und Android.

## Support-URL
Repository auf GitHub (Issues): `https://github.com/almaz6380/earnings-dashboard`

## Datenschutz-URL
`https://<deine-domain>/datenschutz.html` (die Seite liegt im Client und wird mit deployt)

## Hinweise für die Prüfer (App Review Notes / Testzugang)

Die App ist ein Client für ein selbst gehostetes Dashboard. Für die Prüfung bitte diese Testdaten eintragen:

```
Server-Adresse: https://<demo-instanz>
Passwort:       <Demo-Passwort>
```

Tipp: Für die Prüfung eine zweite Vercel-Instanz mit Demo-Daten aufsetzen (gleiches Repo, eigenes DASHBOARD_PASSWORD,
Quellen leer lassen oder Sandbox-Keys). Prüfer müssen sich ohne Rückfrage anmelden können, sonst gibt es eine Ablehnung
nach Richtlinie 2.1 (App Completeness).

Erklärung, warum die App ohne Konto auskommt: Anmeldung erfolgt gegen den eigenen Server des Nutzers; es gibt keine
Registrierung, weil jeder Nutzer sein eigenes Backend betreibt.

## Datenschutz-Angaben im Store

**App Store „App Privacy":** „Data Not Collected" – die App sammelt keine Daten, die an den Entwickler gehen. Die
Einnahmen-Daten gehören dem Nutzer und liegen auf dessen Server.

**Google Play „Datensicherheit":**
- Erhebt die App Nutzerdaten? Nein.
- Werden Daten mit Dritten geteilt? Nein.
- Verschlüsselung bei der Übertragung: Ja (nur HTTPS).
- Löschung: Abmelden löscht alle lokalen Daten.

**Google Play „Inhaltseinstufung":** Fragebogen „Utility/Productivity", keine anstößigen Inhalte → USK 0 / Everyone.

**Export Compliance (App Store):** `ITSAppUsesNonExemptEncryption = NO` ist in Info.plist gesetzt (nur Standard-HTTPS),
darum keine Rückfrage beim Upload.

## Screenshots

Pflicht: iPhone 6,9" (1320×2868) und 6,5" (1284×2778 oder 1242×2688); iPad 13" (2064×2752) nur, wenn die App auf
iPad läuft (ja, dann bitte liefern). Google Play: Telefon mindestens 2 Stück (1080×1920 oder höher), Feature-Grafik
1024×500 Pflicht.

Empfohlene Motive (alle vier Tabs):
1. Übersicht mit großer Tageszahl und Quellkarten
2. Apps-Tab mit Icons und Balken
3. Verlauf (Diagramm)
4. Quellen (Status)

Aufnehmen im Simulator (Xcode: ⌘S) bzw. Android-Emulator, gern mit Demo-Daten. Keine Statusleiste mit persönlichen
Daten, keine echten Kontostände.
