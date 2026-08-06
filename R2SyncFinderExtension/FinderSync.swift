import FinderSync
import Cocoa

@objc(FinderSync)
class FinderSync: FIFinderSync {

    override init() {
        super.init()
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs")
        
        let urlsToMonitor: Set<URL> = [
            defaultPath,
            defaultPath.resolvingSymlinksInPath()
        ]
        
        FIFinderSyncController.default().directoryURLs = urlsToMonitor
        setupBadges()
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
    }

    override func requestBadgeIdentifier(for url: URL) {
        FIFinderSyncController.default().setBadgeIdentifier("synced", for: url)
    }

    // MARK: - Context Menu Integration for Files & Directory

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        let menu = NSMenu(title: "")

        let copyItem = NSMenuItem(title: "R2 Share Link kopieren", action: #selector(copyPublicLink(_:)), keyEquivalent: "")
        copyItem.target = self
        menu.addItem(copyItem)

        let syncItem = NSMenuItem(title: "Jetzt synchronisieren", action: #selector(forceSyncItem(_:)), keyEquivalent: "")
        syncItem.target = self
        menu.addItem(syncItem)

        return menu
    }

    @objc func copyPublicLink(_ sender: AnyObject?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs(), let item = items.first else { return }
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs").path
        let rootURL = URL(fileURLWithPath: defaultPath)
        
        var relativePath = String(item.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(relativePath, forType: .string)
    }

    @objc func forceSyncItem(_ sender: AnyObject?) {
    }
}
