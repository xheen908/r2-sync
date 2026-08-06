import FinderSync
import Cocoa

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
        // Create custom green checkmark image badge
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

    override func menu(for menuKind: FIMenuKind) -> NSMenu {
        let menu = NSMenu(title: "")
        menu.addItem(withTitle: "R2 Public Link kopieren", action: #selector(copyPublicLink(_:)), keyEquivalent: "")
        menu.addItem(withTitle: "Erneut synchronisieren", action: #selector(forceSyncItem(_:)), keyEquivalent: "")
        return menu
    }

    @IBAction func copyPublicLink(_ sender: AnyObject?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs() else { return }
        for item in items {
            NSLog("[FinderSync] Copying link for item: %@", item.path)
        }
    }

    @IBAction func forceSyncItem(_ sender: AnyObject?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs() else { return }
        for item in items {
            NSLog("[FinderSync] Force sync item: %@", item.path)
        }
    }
}
