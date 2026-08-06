import FinderSync
import Cocoa

@objc(FinderSync)
public class FinderSync: FIFinderSync {

    public override init() {
        super.init()
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs")
        FIFinderSyncController.default().directoryURLs = [defaultPath]
    }

    public override func requestBadgeIdentifier(for url: URL) {
        FIFinderSyncController.default().setBadgeIdentifier("synced", for: url)
    }

    public override var toolbarItemName: String {
        return "R2Sync"
    }

    public override var toolbarItemToolTip: String {
        return "R2Sync Status"
    }

    public override var toolbarItemImage: NSImage {
        return NSImage(systemSymbolName: "icloud.fill", accessibilityDescription: "R2Sync") ?? NSImage()
    }

    public override func menu(for menuKind: FIMenuKind) -> NSMenu? {
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
        let defaults = UserDefaults(suiteName: "com.r2sync.app") ?? UserDefaults.standard
        let syncFolderPath = defaults.string(forKey: "r2_sync_folder_path") ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Documents/EasyFisk-Docs")
        var publicDomainURL = defaults.string(forKey: "r2_public_domain_url") ?? "https://pub-7934cd421fb044609578237788351fae.r2.dev"
        if !publicDomainURL.hasSuffix("/") { publicDomainURL += "/" }

        let rootURL = URL(fileURLWithPath: syncFolderPath)
        var relativePath = String(item.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

        let finalShareURL = publicDomainURL + relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.declareTypes([.string], owner: nil)
        pasteboard.setString(finalShareURL, forType: .string)
    }

    @objc func forceSyncItem(_ sender: AnyObject?) {
    }
}
