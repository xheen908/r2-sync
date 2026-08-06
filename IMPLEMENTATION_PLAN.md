# Implementation Plan - Native macOS Cloudflare R2 Sync Application

Eine native macOS Menüleisten-Anwendung (Swift/SwiftUI), die einen lokalen Ordner nahtlos mit einem Cloudflare R2 Bucket synchronisiert. Das System bietet Echtzeit-Synchronisation, Upload-/Download-Fortschritt in der Menüleiste, Status-Badges (grüne Häkchen) im Finder und DMG-Verteilung.

---

## User Review Required

> [!IMPORTANT]
> **Voraussetzungen für die spätere Finder-Integration & Verteilung:**
> 1. **FinderSync Extension:** Die grünen Häkchen im Finder erfordern ein Xcode-Projekt mit App Extension Target (`FIFinderSync`).
> 2. **Apple Developer Account (Optional für lokale Nutzung, erforderlich für Releasability):** Für das Signieren und Notarisieren der `.dmg` zur künftigen Weitergabe an andere Mac-User.
> 3. **Developer Environment:** macOS mit installiertem Xcode (oder `xcodebuild` CLI Tools).

---

## Architektur-Übersicht

```
┌────────────────────────────────────────────────────────────────────────┐
│                          macOS Menu Bar App                            │
│  • Menüleisten-Icon (Status: Idle / Syncing / Error)                   │
│  • Popover UI: Upload Progress, Transfer Queue, Recent Activity        │
│  • Einstellungen: R2 Endpoint, Bucket Name, Credentials (Keychain)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ IPC (App Groups / DistributedNotification Center)
┌───────────────────────────────────▼────────────────────────────────────┐
│                             Sync Engine                                │
│  • File Watcher: macOS FSEvents API (Echtzeit-Dateien-Erkennung)       │
│  • Database: SQLite (GRDB.swift / SwiftData) - Dateizustände, Hashes  │
│  • Network Layer: AWS SDK for Swift / S3 Client (Multipart Uploads)    │
│  • Conflict Solver: ETag & Last-Modified Strategie                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ FinderSync Protocol
┌───────────────────────────────────▼────────────────────────────────────┐
│                        FinderSync Extension                            │
│  • Finder Icon Badges (Syncing, Synced, Error)                         │
│  • Finder Kontextmenü ("Link kopieren", "Erneute Synchronisation")     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Phasenweiser Implementierungsplan

### Phase 1: Projekt-Setup & Grundlagen-Architektur
Setzt die Projektstruktur, Abhängigkeiten und die grundlegende Konfiguration auf.

* **1.1 Xcode Projektstruktur aufsetzen**
  * Erstellen des Haupt-App Targets (`R2SyncApp`) als Agent-App (`LSUIElement` = true für reine Menüleisten-App ohne Dock-Icon).
  * Erstellen des App Extension Targets (`R2SyncFinderExtension`) für FinderSync.
  * Konfigurieren von App Groups für Shared Container / IPC zwischen Haupt-App und Finder Extension.
* **1.2 Package Dependencies einbinden**
  * `AWS SDK for Swift` (oder leichtgewichtiger Swift S3 Client) für Cloudflare R2 Kommunikation.
  * `GRDB.swift` (SQLite Wrapper) oder SwiftData für die lokale Metadaten-Datenbank.
* **1.3 Sichere Konfigurationsspeicherung**
  * Keychain-Wrapper für die sichere Speicherung von `Account ID`, `Access Key ID`, `Secret Access Key` und `Bucket Name`.

---

### Phase 2: Core Sync Engine & R2 Integration
Baut das Herzstück der Anwendung für Datei-Überwachung, S3-Kommunikation und Zustandstracking.

* **2.1 SQLite Metadaten-Datenbank (`SyncDatabase`)**
  * Tabelle für Dateizustände: `local_path`, `remote_key`, `file_hash` (MD5/SHA256), `etag`, `last_modified`, `sync_state` (`synced`, `pending_upload`, `pending_download`, `error`).
* **2.2 Lokaler File Watcher (`FSEventsWatcher`)**
  * Anbindung der macOS `FSEvents` C-API in Swift zur ressourcenschonenden Echtzeit-Überwachung des gewählten Sync-Ordners.
  * Debouncing-Mechanismus für Datei-Schreibvorgänge (z.B. große Dateien beim Erstellen abwarten).
* **2.3 Cloudflare R2 S3 Service (`R2StorageService`)**
  * S3 Client Initialisierung mit R2 Endpoint (`https://<account_id>.r2.cloudflarestorage.com`).
  * Upload Manager: Unterstützung für Standard-Uploads und Chunked Multipart Uploads für große Dateien (> 5MB).
  * Download Manager: Streaming-Download in temporäre Dateien mit atomarem Verschieben in den Zielordner.
  * Remote Listing Engine: Rekursives Listing des Buckets zur Erkennung von Cloud-Änderungen.
* **2.4 Synchronisations-Logik (`SyncEngineController`)**
  * 2-Wege-Sync Algorithmus (Local Changes vs. Remote Changes).
  * Konfliktbehandlung (z.B. Erzeugung von `filename (Conflict Copy).ext`).
  * Retry Queue mit Exponential Backoff bei Netzwerkausfällen.

---

### Phase 3: Native Menüleisten GUI (SwiftUI)
Erstellt das Benutzeroberflächen-Konzept im macOS System Tray.

* **3.1 Dynamic Menu Bar Item (`StatusItemManager`)**
  * Menüleisten-Icon mit adaptiven Zuständen (Normal, Drehendes Sync-Icon, Fehler-Icon, Offline).
* **3.2 Popover Interface (`SyncStatusView`)**
  * Header mit aktuellem Status ("Alles synchronisiert", "Synchronisiere X Datei(en)...").
  * **Progress Bar Component:** Aktueller Upload-/Download-Fortschritt (MB/s, Verbleibende Zeit, Prozentanzeige).
  * **Activity List:** Verlauf der zuletzt synchronisierten Dateien.
  * Quick-Action-Buttons: Ordner im Finder öffnen, Sync pausieren/fortsetzen, Einstellungen öffnen.
* **3.3 Einstellungen-Fenster (`SettingsView`)**
  * R2 Zugangsdaten & Connection Test Button.
  * Auswahl des lokalen Sync-Ordners (`NSOpenPanel`).
  * Autostart bei Mac-Anmeldung (macOS `SMAppService` API).

---

### Phase 4: Finder Integration (FinderSync Extension & Badges)
Integriert die Statushäkchen und Kontextmenüs direkt in den macOS Finder.

* **4.1 FinderSync Extension (`FIFinderSync`)**
  * Registrierung des überwachten Sync-Pfad-Bereichs bei macOS (`FIFinderSyncController.default().directoryURLs`).
* **4.2 Badge Overlay Controller**
  * Laden und Zuweisen der Badges:
    * 🟢 **Synced:** Erfolgreich in R2 gesichert.
    * 🔵 **Syncing:** Upload/Download läuft aktuell.
    * 🔴 **Error:** Synchronisationsfehler.
  * IPC-Schnittstelle zur Haupt-App zur Abfrage des aktuellen Status pro Pfad.
* **4.3 Finder Kontextmenü**
  * Rechtsklick auf Datei im Sync-Ordner:
    * "R2 Public Link kopieren" (falls konfiguriert).
    * "Jetzt erneut synchronisieren".

---

### Phase 5: Packaging, DMG Erstellung & Polishing

* **5.1 App Polishing & System Health**
  * Optimierung von RAM- und CPU-Verbrauch im Leerlauf (Sleep-Modus bei Inaktivität).
  * Native macOS Notifications (`UserNotifications` Framework) bei Sync-Fehlern oder abgeschlossenen Batch-Uploads.
* **5.2 DMG Packaging Automatisierung**
  * Erstellung eines `build_dmg.sh` Skripts basierend auf `create-dmg`.
  * Ausgestaltet mit individuellem Hintergrundbild, App-Icon und Drag-to-Applications Pfeil.
* **5.3 Notarisierungs-Pipeline (Optional)**
  * Einbindung von `xcrun notarytool` zur automatischen Notarisierung des DMG für Gatekeeper-Kompatibilität.

---

## Verification Plan

### Automated Tests
- **Unit Tests:**
  - Testen des `SyncEngineController` Hash-Vergleichs und der Konfliktlösungs-Logik.
  - Testen der Keychain-Speicherung und R2 S3 Endpoint URL Formatierung.
- **Integration Tests:**
  - Testen von Upload/Download-Zyklen gegen ein Test-Bucket auf Cloudflare R2.

### Manual Verification
- **FSEvent Test:** Erstellen, Ändern, Umbenennen und Löschen von Dateien/Ordnern im lokalen Verzeichnis und Prüfen des R2 Bucket-Zustands.
- **Large File Test:** Upload einer 500MB+ Datei zur Verifizierung des Multipart-Uploads und des Progress-Balkens in der Menüleiste.
- **Finder Badge Test:** Überprüfung der korrekten Anzeige von grünen Häkchen und Sync-Badges im Finder.
- **DMG Install Test:** Installation der kompilierten `.dmg` auf einem frischen macOS-Benutzerkonto.
