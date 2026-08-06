import FinderSync
import Cocoa

@objc(FinderSync)
class FinderSync: FIFinderSync {

    override init() {
        super.init()
        NSLog("[FinderSync] Extension starting initialization...")
        setupBadges()
        updateMonitoredDirectories()
    }

    private func updateMonitoredDirectories() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs").path
        let syncPath = UserDefaults.standard.string(forKey: "r2_sync_folder_path") ?? defaultPath
        
        let syncFolderURL = URL(fileURLWithPath: syncPath)
        FIFinderSyncController.default().directoryURLs = Set([syncFolderURL])
        NSLog("[FinderSync] Monitoring directory set to: %@", syncFolderURL.path)
    }

    private func setupBadges() {
        let badgeSize = NSSize(width: 16, height: 16)
        let badgeImage = NSImage(size: badgeSize, flipped: false) { rect in
            let circle = NSBezierPath(ovalIn: rect)
            NSColor.systemGreen.set()
            circle.fill()

            let checkmark = NSBezierPath()
            checkmark.move(to: NSPoint(x: rect.width * 0.28, y: rect.height * 0.50))
            checkmark.line(to: NSPoint(x: rect.width * 0.45, y: rect.height * 0.32))
            checkmark.line(to: NSPoint(x: rect.width * 0.72, y: rect.height * 0.68))
            checkmark.lineWidth = 2.0
            NSColor.white.set()
            checkmark.stroke()

            return true
        }

        FIFinderSyncController.default().setBadgeImage(badgeImage, label: "Synced", forBadgeIdentifier: "synced")
        NSLog("[FinderSync] Registered custom green checkmark badge image")
    }

    // MARK: - Primary Finder Sync Methods

    override func requestBadgeIdentifier(for url: URL) {
        NSLog("[FinderSync] requestBadgeIdentifier for URL: %@", url.path)
        FIFinderSyncController.default().setBadgeIdentifier("synced", for: url)
    }

    // MARK: - Context Menu Integration

    override var toolbarItemName: String {
        return "R2Sync"
    }

    override var toolbarItemToolTip: String {
        return "Cloudflare R2 Sync Status"
    }

    override var toolbarItemImage: NSImage {
        return NSImage(systemSymbolName: "icloud.fill", accessibilityDescription: "R2Sync") ?? NSImage()
    }

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        let menu = NSMenu(title: "R2Sync")

        let copyItem = NSMenuItem(title: "R2 Share Link kopieren", action: #selector(copyPublicLink(_:)), keyEquivalent: "")
        copyItem.target = self
        menu.addItem(copyItem)

        let syncItem = NSMenuItem(title: "Jetzt synchronisieren", action: #selector(forceSyncItem(_:)), keyEquivalent: "")
        syncItem.target = self
        menu.addItem(syncItem)

        return menu
    }

    @objc @IBAction func copyPublicLink(_ sender: AnyObject?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs(), let item = items.first else { return }
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs").path
        let rootURL = URL(fileURLWithPath: defaultPath)
        
        var relativePath = String(item.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(relativePath, forType: .string)
        NSLog("[FinderSync] Copied path to pasteboard: %@", relativePath)
    }

    @objc @IBAction func forceSyncItem(_ sender: AnyObject?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs() else { return }
        for item in items {
            NSLog("[FinderSync] Force sync item: %@", item.path)
        }
    }
}
