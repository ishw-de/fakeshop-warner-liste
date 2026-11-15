# Fakeshop-Warner

Browsererweiterung (Chrome/Edge, Manifest V3), die bei jedem Seitenaufruf prüft,
ob die Domain auf einer bekannten Fakeshop-Warnliste steht, und falls ja einen
Banner auf der Seite sowie ein rotes Badge auf dem Extension-Icon anzeigt.

## Projektstruktur

```
FakeShops/
├── extension/          Die eigentliche Browsererweiterung (Manifest V3)
│   ├── manifest.json
│   ├── background.js   Service Worker: lädt Liste, prüft Navigationen
│   ├── content/         Warn-Banner (wird bei Treffer injiziert)
│   ├── popup/           Klick aufs Icon: Status der aktuellen Seite
│   ├── options/         Einstellungen (URL der gehosteten Liste)
│   ├── data/            Mitgelieferte Fallback-Liste (fakeshops.json)
│   └── icons/
├── scraper/            Node-Skript, das die Quellen abruft und die JSON-Liste erzeugt
│   └── scrape.js
├── data/               Von scrape.js erzeugte Rohausgabe (Kopie geht nach extension/data/)
└── iconsgen/           Einmaliges Hilfsskript zur Icon-Erzeugung (nicht Teil der Extension)
```

## Datenquellen

| Quelle | Status | Hinweis |
|---|---|---|
| **Trusted Shops** – trustedshops.de/fake-shops/ | ✅ wird gescraped | Statische Liste, ca. 100 Einträge |
| **Verbraucherzentrale** – warnung.fakeshop-finder.de | ✅ wird gescraped | Chronologische Warnliste der letzten Monate |
| **Watchlist Internet** (AT) – watchlist-internet.at/liste-betruegerischer-shops/ | ⚠️ **nicht automatisiert** | Die Seite blockt automatisierte HTTP-Clients per Cloudflare-Bot-Schutz (403). Das bewusst zu umgehen (z.B. über einen anderen Client-Fingerprint) wurde hier **nicht** gemacht. Der Scraper-Code dafür liegt auskommentiert in `scraper/scrape.js`, falls die Seite künftig eine offizielle Schnittstelle anbietet. |
| **Verbraucherzentrale Fakeshop-Finder** (die eigentliche URL-Prüf-Funktion auf fakeshopfinder-71560) | ❌ nicht nutzbar | Das ist ein interaktives Prüf-Tool (URL eingeben → Ampel-Ergebnis), keine abrufbare Liste. Nicht automatisierbar ohne eigene massenhafte Anfragen an deren Dienst, was unangemessen wäre. |

Die Extension prüft Domains also gegen die **Trusted-Shops-** und
**Verbraucherzentrale-Warnliste**. Das deckt einen großen Teil aktueller
deutscher Fakeshops ab, aber nicht die (sehr umfangreiche) österreichische
Watchlist-Internet-Liste.

## 1. Liste aktualisieren (Scraper)

```bash
cd scraper
npm install
node scrape.js
```

Erzeugt `data/fakeshops.json`. Optionen:

```bash
node scrape.js --delay=400      # Pause zwischen Requests in ms (Standard: 400)
node scrape.js --out=../data/fakeshops.json
```

Die Datei danach nach `extension/data/fakeshops.json` kopieren, damit die
mitgelieferte Fallback-Liste aktuell ist:

```bash
cp data/fakeshops.json extension/data/fakeshops.json
```

### Liste automatisch hosten (empfohlen)

Damit installierte Extensions die Liste **ohne Extension-Update** bekommen,
sollte `fakeshops.json` irgendwo mit stabiler URL gehostet werden, z.B.:

- GitHub Pages / GitHub raw-Link eines Repos, in dem ein Cronjob (GitHub Actions)
  `node scrape.js` z.B. täglich laufen lässt und das JSON committed/published.
- Ein eigener kleiner Server/Bucket (S3, Cloudflare R2, etc.), auf den ein Cron
  regelmäßig den Scraper laufen lässt und die Datei hochlädt.

Die Extension liest die URL aus den Einstellungen (`options/options.html`) und
fragt sie zweimal täglich automatisch ab (Fallback: mitgelieferte Datei).

## 2. Extension installieren (Chrome/Edge)

1. `chrome://extensions` öffnen
2. Oben rechts **"Entwicklermodus"** aktivieren
3. **"Entpackte Erweiterung laden"** klicken
4. Den Ordner `extension/` auswählen
5. Fertig – beim Besuch einer gelisteten Fakeshop-Domain erscheint ein roter
   Banner oben auf der Seite, zusätzlich ein rotes Badge auf dem Icon.

Über das Extension-Icon (Popup) seht ihr den Status der aktuellen Seite und
könnt die Liste manuell aktualisieren. Über **Einstellungen** lässt sich die
URL der gehosteten Liste eintragen.

## Funktionsweise

- `background.js` lädt die Liste (remote oder mitgeliefert) beim Start und
  danach alle 12 Stunden per `chrome.alarms` neu, normalisiert alle Domains
  (lowercase, ohne `www.`) und speichert sie als Map in `chrome.storage.local`.
- Bei jeder Top-Level-Navigation (`chrome.webNavigation.onCommitted`) wird der
  Hostname gegen diese Map geprüft (exakter Domain-Match).
- Bei Treffer: Badge, Tooltip und ein über `chrome.scripting.executeScript`
  injizierter Banner (`content/banner.js` + `banner.css`).

## Bekannte Grenzen

- **Nur exakter Domain-Match.** Subdomains werden nicht automatisch über die
  Hauptdomain erkannt (eine Liste mit `shop.de` erkennt nicht automatisch
  `sub.shop.de`, falls `sub.shop.de` nicht separat gelistet ist).
- **Watchlist Internet (AT)** ist aktuell nicht Teil der automatisierten Liste
  (siehe oben).
- Die Listen sind nur so aktuell wie der letzte Scraper-Lauf. Ohne gehostete
  Liste + Cron-Job bekommt eine bereits installierte Extension nur die zum
  Installationszeitpunkt mitgelieferte Momentaufnahme.
