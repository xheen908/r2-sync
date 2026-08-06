# ☁️ R2Sync - Native macOS Cloudflare R2 Sync App & Finder Integration

![macOS 13+](https://img.shields.io/badge/macOS-13.0%2B-orange?style=for-the-badge&logo=apple)
![Swift 5.9](https://img.shields.io/badge/Swift-5.9-F05138?style=for-the-badge&logo=swift)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?style=for-the-badge&logo=cloudflare)

**R2Sync** ist eine hochperformante, native macOS System-Tray Anwendung (Swift/SwiftUI), die lokale Ordner automatisch und rekursiv in Echtzeit mit einem **Cloudflare R2 Bucket** synchronisiert. Inklusive eleganter macOS Finder-Kontextmenü-Integration zum schnellen Kopieren von Freigabelinks.

---

## 🌟 Highlights & Features

- 🔄 **Echtzeit-Synchronisation:** Automatische Überwachung von Dateiänderungen und Unterordnern über macOS `FSEvents`.
- 📂 **Rekursive Unterordner-Struktur:** Behält alle Unterverzeichnisse exakt wie auf der Festplatte im Cloudflare R2 Bucket bei.
- 🔗 **Finder Kontextmenü ("R2 Share Link kopieren"):** Rechtsklick auf eine beliebige Datei in Ihrem Sync-Ordner generiert sofort den öffentlichen R2-Downloadlink direkt in Ihre Zwischenablage (`NSPasteboard`).
- 🎨 **Full-Bleed Cloudflare Design:** Modernes Menüleisten-Icon und App-Icon im offiziellen Cloudflare-Orange (`#F38020`).
- 🔐 **Sichere Schlüsselbund-Speicherung:** Speichert Account-IDs und Secret Access Keys sicher im macOS System Keychain.
- ⚙️ **GUI-Einstellungen:** Bequeme Konfiguration von Account-ID, Access Keys, Bucket-Namen, Sync-Ordner und Öffentlicher Domain direkt über die App-Oberfläche.

---

## 📸 Screenshots & Nutzung

### 1. Menüleisten-Steuerung (System Tray)
Klicken Sie oben in der macOS Menüleiste auf das Wolken-Icon, um den aktuellen Synchronisations-Status zu sehen, aktive Übertragungen zu verfolgen oder die Einstellungen zu öffnen.

### 2. Finder Rechtsklick-Kontextmenü
Machen Sie einen Rechtsklick auf eine beliebige Datei im Sync-Ordner:
Unter **Schnellaktionen** ➔ **`R2 Share Link kopieren`** wählen. Der öffentliche Link steht sofort per `Cmd + V` zur Verfügung!

---

## 🛠️ Installation & Erstausführung

### Voraussetzungen
- **macOS 13.0 (Ventura)** oder neuer.
- Ein **Cloudflare R2 Bucket** mit API Access Keys (`Access Key ID` & `Secret Access Key`).

### Schnellstart per Shell-Skript
1. Repository klonen:
   ```bash
   git clone https://github.com/xheen908/r2-sync.git
   cd r2-sync
   ```

2. Anwendung kompilieren & installieren:
   ```bash
   ./Scripts/build_dmg.sh
   ```

3. Die App starten (`/Applications/R2SyncApp.app`).

4. **Finder Schnellaktion aktivieren:**
   - Öffnen Sie **Systemeinstellungen** ➔ **Tastatur** ➔ **Tastaturkurzbefehle...** ➔ **Dienste** *(Services)*.
   - Aktivieren Sie unter **Dateien und Ordner** den Haken bei **`R2 Share Link kopieren`**.

---

## ⚙️ Einstellungen in der App

Öffnen Sie die Einstellungen über das Menüleisten-Icon:

| Parameter | Beschreibung | Beispiel |
| :--- | :--- | :--- |
| **Account ID** | Ihre Cloudflare Account ID | `10c9109e9e342e2b4fc55e...` |
| **Access Key ID** | Cloudflare R2 S3 Access Key | `6e87984a4bbe49ca...` |
| **Secret Access Key** | Cloudflare R2 S3 Secret Key | `ec9f8d764026995f...` |
| **Bucket Name** | Ziel-Bucket im Cloudflare R2 Dashboard | `easyfisk-docs` |
| **Sync Ordner** | Lokaler Pfad auf Ihrem Mac | `/Users/.../Documents/EasyFisk-Docs` |
| **Öffentliche Domain / URL** | R2 Public Domain oder Custom Domain | `https://pub-7934cd421fb044609578237788351fae.r2.dev` |

---

## 📁 Projektstruktur

```
r2-sync/
├── Sources/
│   └── R2SyncApp/           # SwiftUI & AppKit Hauptanwendung
│       ├── R2SyncApp.swift  # Main Entry Point, Menüleiste & Settings GUI
│       ├── ConfigManager.swift # persistent Config & Keychain Handling
│       ├── SyncEngineController.swift # Rekursive S3 Sync Engine
│       └── FSEventsWatcher.swift # macOS File System Event Loop
├── Scripts/
│   ├── build_dmg.sh         # Automatisches Packaging & Signierungs-Skript
│   └── copy_r2_link.swift   # Swift CLI für schnelle Share Link Berechnungen
├── bin/
│   └── copy_r2_link         # Hochperformantes kompilierte Executable für den Finder
├── dist/
│   └── R2 Share Link kopieren.workflow # macOS QuickAction Service Bundle
├── worker/                  # Optionaler Cloudflare Worker für Link-Management
└── Package.swift            # Swift Package Manager Manifest
```

---

## 📄 Lizenz

Dieses Projekt steht unter der **MIT Lizenz**.
