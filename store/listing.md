# Store-Eintrag (Texte zum Kopieren)

Alle Felder in Deutsch. Für den App Store gilt die Zeichengrenze in Klammern.

## Name
**Einnahmen** (30)

## Untertitel / Kurzbeschreibung
App Store (30): `Alle App-Einnahmen in Euro`
Google Play (80): `Alle App-Einnahmen an einer Stelle: Stores, Werbung, Kontostände – in deiner Währung.`

## Beschreibung (App Store 4000, Google Play 4000)

Einnahmen zeigt dir alle Erlöse deiner Apps an einer Stelle, umgerechnet in deine Währung:

• RevenueCat: Abo-Umsatz, MRR und aktive Abos, mehrere Projekte zusammengefasst
• AdMob und AdSense: Werbeeinnahmen pro Tag und offenes Guthaben
• App Store und Google Play: Tageserlöse und die tatsächlichen Auszahlungen je Monat
• Wise und PayPal: aktuelle Kontostände
• Wechselkurse der Europäischen Zentralbank, Basiswährung frei wählbar

Eine große Zahl für den letzten Tag, farbige Karten je Quelle, die Aufschlüsselung nach Apps und ein Verlauf über zwei Jahre. Zum Aktualisieren einfach nach unten ziehen. Auf Wunsch jeden Morgen eine Zusammenfassung per ntfy oder Telegram.

So funktioniert es: Konto mit E-Mail und Passwort anlegen, dann die Dienste verbinden, die du nutzt – Google mit einem Klick, alle anderen mit einem API-Schlüssel mit Leserecht. Die Zugangsdaten liegen verschlüsselt auf unserem Server, werden nie angezeigt und nur zum Abrufen deiner Berichte verwendet. Nichts wird geändert, nichts kann ausgezahlt werden.

Keine Werbung, kein Tracking, keine Weitergabe. Konto und alle Daten lassen sich jederzeit in der App löschen.

Für Indie-Entwicklerinnen und -Entwickler, kleine Studios und alle, die ihre Zahlen ohne fünf Dashboards sehen wollen.

## Schlüsselwörter (App Store, 100 Zeichen, kommagetrennt)
`einnahmen,umsatz,revenuecat,admob,adsense,app store connect,google play,wise,paypal,dashboard,indie`

## Kategorie
App Store: Finanzen (sekundär: Wirtschaft). Google Play: Finanzen.

## Neuerungen in dieser Version (1.0.0)
Erste Version: Konto anlegen, Quellen verbinden, Übersicht, Apps, Verlauf und tägliche Meldung.

## Support-URL
`https://<deine-domain>/` oder das Repository: `https://github.com/almaz6380/earnings-dashboard`

## Datenschutz-URL
`https://<deine-domain>/datenschutz.html` – Nutzungsbedingungen: `https://<deine-domain>/nutzungsbedingungen.html`
Beide Seiten enthalten Platzhalter in eckigen Klammern (Name, Anschrift, Regionen), die vor dem Einreichen gefüllt werden müssen.

## Hinweise für die Prüfer (App Review Notes)

Prüfer können sich selbst ein Konto anlegen („Konto erstellen" auf dem Startbildschirm). Zusätzlich ein
vorbereitetes Konto mit Beispieldaten angeben, damit die Prüfer die Übersicht nicht leer sehen:

```
E-Mail:    review@<deine-domain>
Passwort:  <Review-Passwort>
```

Beispieldaten fürs Review-Konto: per `node server/cli.js` ein Konto anlegen und einen Verlauf einspielen
(siehe docs/APP-STORE.md, „Review-Konto"). Google-Login ist im Review nicht nötig; RevenueCat/Wise/PayPal
lassen sich mit Sandbox-Zugängen zeigen.

Text für das Feld „Notes":
> Einnahmen zeigt Entwicklern ihre eigenen App-Umsätze aus Drittdiensten. Ein Konto kann direkt in der App erstellt
> werden. Der Google-Login (AdMob/AdSense/Play) ist optional und wird über den System-Browser mit Rücksprung in die
> App durchgeführt. Konto-Löschung: Tab „Konto" → „Konto unwiderruflich löschen".

## Datenschutz-Angaben im Store

**App Store „App Privacy"** – Daten, die mit dem Nutzer verknüpft sind („Linked to You"):
- Kontaktinformationen: E-Mail-Adresse (Zweck: App-Funktionalität)
- Finanzinformationen: Zahlungsinformationen / andere Finanzinformationen (Einnahmen-Berichte; Zweck: App-Funktionalität)
- Nutzerinhalte: Sonstige (API-Schlüssel; Zweck: App-Funktionalität)
- Kennungen: Nutzer-ID
- Kein Tracking.

**Google Play „Datensicherheit":**
- Erhebt die App Nutzerdaten? Ja: E-Mail-Adresse, Finanzinformationen (Einnahmen), Nutzer-IDs, App-Aktivität nein.
- Zweck: App-Funktionalität. Erforderlich (nicht optional) für E-Mail; Finanzdaten optional je Quelle.
- Weitergabe an Dritte: Nein (Auftragsverarbeiter Hosting/Datenbank zählen nicht als Weitergabe).
- Verschlüsselung bei der Übertragung: Ja. Löschung: Ja, in der App („Konto löschen").
- **Kontolöschungs-URL** (Pflicht seit 2024): `https://<deine-domain>/datenschutz.html#loeschen` – oder eine eigene Seite,
  die den Weg beschreibt (Tab Konto → Konto löschen).

**Google Play „Inhaltseinstufung":** Fragebogen „Utility/Productivity", keine anstößigen Inhalte → USK 0 / Everyone.
**Zielgruppe:** 18+ (Finanzdaten, Nutzungsbedingungen verlangen Volljährigkeit).

**Export Compliance (App Store):** `ITSAppUsesNonExemptEncryption = NO` ist in Info.plist gesetzt (nur Standard-HTTPS).

**Login-Dienste (Apple 4.8):** Die App bietet nur E-Mail/Passwort und keinen Drittanbieter-Login als Anmeldung;
„Google verbinden" ist eine Datenquelle, kein Login. Darum ist „Sign in with Apple" nicht erforderlich.

## Screenshots

Pflicht: iPhone 6,9" (1320×2868) und 6,5" (1284×2778 oder 1242×2688); iPad 13" (2064×2752). Google Play: Telefon
mindestens 2 Stück (1080×1920 oder höher), Feature-Grafik 1024×500 Pflicht.

Empfohlene Motive:
1. Übersicht mit großer Tageszahl und Quellkarten (Review-Konto mit Beispieldaten)
2. Apps-Tab mit Icons und Balken
3. Verlauf (Diagramm)
4. Einrichten (Quellen verbinden)
5. Anmeldebildschirm mit „Konto erstellen"

Aufnehmen im Simulator (Xcode: ⌘S) bzw. Android-Emulator. Keine echten Kontostände oder Schlüssel zeigen.
