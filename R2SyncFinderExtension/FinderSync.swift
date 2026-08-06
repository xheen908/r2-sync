import FinderSync
import Cocoa

@objc(FinderSync)
class FinderSync: FIFinderSync {

    override init() {
        super.init()
        updateMonitoredDirectories()
    }

    private func updateMonitoredDirectories() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let defaultPath = home.appendingPathComponent("Documents/EasyFisk-Docs")
        
        var urlsToMonitor: Set<URL> = [defaultPath, defaultPath.resolvingSymlinksInPath()]

        // Enumerate all subdirectories recursively so FinderSync context menus work inside folders!
        let fileManager = FileManager.default
        if let enumerator = fileManager.enumerator(
            at: defaultPath,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) {
            for case let fileURL as URL in enumerator {
                var isDirectory: ObjCBool = false
                if fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), isDirectory.boolValue {
                    urlsToMonitor.insert(fileURL)
                }
            }
        }

        FIFinderSyncController.default().directoryURLs = urlsToMonitor
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
