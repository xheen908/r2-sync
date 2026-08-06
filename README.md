# R2Sync - Native macOS Cloudflare R2 Sync Application

R2Sync ist eine native, leichte macOS Menüleisten-Anwendung (System Tray Agent in Swift/SwiftUI), die einen lokalen Ordner nahtlos mit einem Cloudflare R2 Bucket synchronisiert.

![R2Sync App Icon](AppIconOriginal.png)

## Features

- ⚡ **Nativ & Schnell:** Entwickelt in Swift 5.10 / SwiftUI für macOS 13+. Minimale CPU- und RAM-Last (~20MB RAM).
- ☁️ **Cloudflare R2 (S3 Protocol):** Automatische 2-Wege & rekursive Synchronisation (inkl. tief verschachtelter Unterordner).
- ⚙️ **Menüleisten System Tray App:** Läuft unaufdringlich ohne Dock-Müll als Background-Agent (`LSUIElement`).
- 🔒 **Keychain Security:** Sichere Verwahrung von Account ID, Access Key ID und Secret Access Key im macOS Keychain.
- 🟢 **Finder Sync Extensions:** Icon-Badges und Kontextmenüs direkt im macOS Finder.
- 📦 **DMG Package Build:** Skript zur automatischen Erstellung installierbarer `.dmg` Images mit `create-dmg`.

## Installation & Build

```bash
# Repository klonen
git clone https://github.com/xheen908/r2-sync.git
cd r2-sync

# Release Build & DMG Installer erstellen
./Scripts/build_dmg.sh
```

Das fertige Paket liegt anschließend unter `dist/R2Sync-Installer.dmg`.

## Lizenz
MIT License
