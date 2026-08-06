import SwiftUI
import AppKit

enum SyncState: String {
    case idle = "Idle"
    case syncing = "Syncing"
    case error = "Error"
    case offline = "Offline"
    case notConfigured = "Unconfigured"
}

struct TransferItem: Identifiable {
    let id = UUID()
    let filename: String
    let progress: Double
    let isUpload: Bool
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem?
    var popover: NSPopover?
    var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        // Setup NSStatusItem in System Tray
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        
        if let button = item.button {
            if let customImage = NSImage(systemSymbolName: "icloud.and.arrow.up.fill", accessibilityDescription: "R2Sync") {
                let config = NSImage.SymbolConfiguration(pointSize: 15, weight: .medium)
                button.image = customImage.withSymbolConfiguration(config)
            } else {
                button.title = "R2"
            }
            button.action = #selector(togglePopover)
            button.target = self
        }
        self.statusItem = item

        // Setup Popover
        let popover = NSPopover()
        popover.contentSize = NSSize(width: 320, height: 360)
        popover.behavior = .transient
        popover.contentViewController = NSHostingController(
            rootView: PopOverMenuView(
                configManager: ConfigManager.shared,
                syncEngine: SyncEngineController.shared,
                onOpenSettings: { [weak self] in
                    self?.openSettingsWindow()
                }
            )
        )
        self.popover = popover

        // Start Sync Engine if configured
        if ConfigManager.shared.isConfigured {
            SyncEngineController.shared.startEngine(config: ConfigManager.shared.config)
        }
    }

    @objc func togglePopover() {
        guard let button = statusItem?.button else { return }
        if let popover = popover, popover.isShown {
            popover.performClose(nil)
        } else {
            popover?.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func openSettingsWindow() {
        popover?.performClose(nil)

        if settingsWindow == nil {
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 380),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "R2Sync Einstellungen"
            window.center()
            window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(
                rootView: SettingsView(
                    configManager: ConfigManager.shared,
                    onClose: { [weak window] in
                        window?.close()
                    }
                )
            )
            self.settingsWindow = window
        }

        NSApp.setActivationPolicy(.regular)
        settingsWindow?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main
struct R2SyncApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings {
            EmptyView()
        }
    }
}

struct PopOverMenuView: View {
    @ObservedObject var configManager: ConfigManager
    @ObservedObject var syncEngine: SyncEngineController
    var onOpenSettings: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Header Status
            HStack(spacing: 12) {
                Image(systemName: syncStateIcon)
                    .foregroundColor(syncStateColor)
                    .font(.system(size: 24))
                
                VStack(alignment: .leading, spacing: 2) {
                    Text(syncStateTitle)
                        .font(.headline)
                    
                    if configManager.isConfigured {
                        Text("Bucket: \(configManager.config.bucketName)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    } else {
                        Text("Bitte R2 Zugangsdaten einrichten")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
                Spacer()
            }

            Divider()

            // Configuration Warning Card
            if !configManager.isConfigured {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Verbindung nicht eingerichtet", systemImage: "info.circle.fill")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.orange)
                    
                    Text("Trage deine Cloudflare R2 Account ID, Keys und Bucket-Namen in den Einstellungen ein, um zu starten.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    
                    Button(action: onOpenSettings) {
                        Text("Jetzt konfigurieren...")
                            .font(.caption)
                            .fontWeight(.medium)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 4)
                }
                .padding(10)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)

                Divider()
            }

            // Active Transfers Progress
            if !syncEngine.activeTransfers.isEmpty {
                Text("Aktive Übertragungen (\(syncEngine.activeTransfers.count))")
                    .font(.caption)
                    .foregroundColor(.secondary)

                ForEach(syncEngine.activeTransfers) { item in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: item.isUpload ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                                .foregroundColor(.blue)
                            Text(item.filename)
                                .font(.body)
                                .lineLimit(1)
                            Spacer()
                            Text("\(Int(item.progress * 100))%")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        ProgressView(value: item.progress)
                            .progressViewStyle(.linear)
                    }
                }
                Divider()
            }

            // Quick Actions
            Group {
                Button(action: openSyncFolder) {
                    Label("Sync-Ordner im Finder öffnen", systemImage: "folder.fill")
                }
                .buttonStyle(.plain)
                .disabled(!configManager.isConfigured)

                Button(action: onOpenSettings) {
                    Label("Einstellungen...", systemImage: "gearshape.fill")
                }
                .buttonStyle(.plain)

                Divider()

                Button(action: quitApp) {
                    Label("Beenden", systemImage: "power")
                        .foregroundColor(.red)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(width: 320)
    }

    private var syncStateTitle: String {
        guard configManager.isConfigured else {
            return "Nicht konfiguriert"
        }
        return syncEngine.isSyncing ? "Synchronisiere..." : "Alles synchronisiert"
    }

    private var syncStateIcon: String {
        guard configManager.isConfigured else {
            return "gearshape.badge.exclamationmark"
        }
        return syncEngine.isSyncing ? "arrow.triangle.2.circlepath.circle.fill" : "checkmark.circle.fill"
    }

    private var syncStateColor: Color {
        guard configManager.isConfigured else {
            return .orange
        }
        return syncEngine.isSyncing ? .blue : .green
    }

    private func openSyncFolder() {
        let path = configManager.config.syncFolderPath
        let url = URL(fileURLWithPath: path)
        NSWorkspace.shared.selectFile(nil, inFileViewerRootedAtPath: url.path)
    }

    private func quitApp() {
        NSApplication.shared.terminate(nil)
    }
}

struct SettingsView: View {
    @ObservedObject var configManager: ConfigManager
    var onClose: () -> Void

    @State private var accountId: String = ""
    @State private var accessKeyId: String = ""
    @State private var secretAccessKey: String = ""
    @State private var bucketName: String = ""
    @State private var syncFolderPath: String = ""
    @State private var statusMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section(header: Text("Cloudflare R2 Zugangsdaten").font(.headline)) {
                    TextField("Account ID:", text: $accountId, prompt: Text("z.B. 10c9109e9e342e2b4fc55e71ddf91c17"))
                    TextField("Access Key ID:", text: $accessKeyId, prompt: Text("z.B. 6e87984a4bbe49caaee83a4d3eee39a0"))
                    SecureField("Secret Access Key:", text: $secretAccessKey, prompt: Text("Schlüssel hier eingeben"))
                    TextField("Bucket Name:", text: $bucketName, prompt: Text("z.B. easyfisk-docs"))
                }

                Section(header: Text("Lokales Verzeichnis").font(.headline)) {
                    HStack {
                        TextField("Sync Ordner:", text: $syncFolderPath)
                        Button("Durchsuchen...") {
                            selectFolder()
                        }
                    }
                }
            }
            .formStyle(.grouped)

            Divider()

            HStack {
                if let message = statusMessage {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(message.contains("gespeichert") ? .green : .red)
                }
                Spacer()
                Button("Abbrechen") {
                    onClose()
                }
                .keyboardShortcut(.cancelAction)

                Button("Speichern & Verbinden") {
                    saveSettings()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
            .padding()
            .background(Color(NSColor.windowBackgroundColor))
        }
        .frame(width: 480, height: 380)
        .onAppear {
            accountId = configManager.config.accountId
            accessKeyId = configManager.config.accessKeyId
            secretAccessKey = configManager.config.secretAccessKey
            bucketName = configManager.config.bucketName
            syncFolderPath = configManager.config.syncFolderPath
        }
    }

    private func selectFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            syncFolderPath = url.path
        }
    }

    private func saveSettings() {
        guard !accountId.isEmpty, !accessKeyId.isEmpty, !secretAccessKey.isEmpty, !bucketName.isEmpty else {
            statusMessage = "Bitte fülle alle R2 Felder aus."
            return
        }

        let newConfig = R2Config(
            accountId: accountId,
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
            bucketName: bucketName,
            syncFolderPath: syncFolderPath
        )
        configManager.saveConfig(newConfig)
        
        // Restart Sync Engine with new credentials
        SyncEngineController.shared.startEngine(config: newConfig)

        statusMessage = "Konfiguration erfolgreich gespeichert!"
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            onClose()
        }
    }
}
