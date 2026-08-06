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

    override func menu(for menuKind: FIMenuKind) -> NSMenu? {
        let menu = NSMenu(title: "")
        menu.addItem(withTitle: "R2 Share Link kopieren", action: #selector(copyPublicLink(_:)), keyEquivalent: "")
        menu.addItem(withTitle: "Jetzt synchronisieren", action: #selector(forceSyncItem(_:)), keyEquivalent: "")
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
