import FinderSync
import Cocoa

@objc(FinderSync)
class FinderSync: FIFinderSync {

    override init() {
        super.init()
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs")
        FIFinderSyncController.default().directoryURLs = [defaultPath]
    }

    override func requestBadgeIdentifier(for url: URL) {
        FIFinderSyncController.default().setBadgeIdentifier("synced", for: url)
    }

    override var toolbarItemName: String {
        return "R2Sync"
    }

    override var toolbarItemToolTip: String {
        return "R2Sync Status"
    }

    override var toolbarItemImage: NSImage {
        return NSImage(systemSymbolName: "icloud.fill", accessibilityDescription: "R2Sync") ?? NSImage()
    }

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
        let rootURL = home.appendingPathComponent("Documents/EasyFisk-Docs")
        
        var relativePath = String(item.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(relativePath, forType: .string)
    }

    @objc func forceSyncItem(_ sender: AnyObject?) {
    }
}
