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

        let shareSubmenu = NSMenu(title: "R2 Freigabelink erstellen")

        let item1h = NSMenuItem(title: "⏱️ 1 Stunde", action: #selector(copyLink1h(_:)), keyEquivalent: "")
        item1h.target = self
        shareSubmenu.addItem(item1h)

        let item24h = NSMenuItem(title: "⏱️ 24 Stunden (1 Tag)", action: #selector(copyLink24h(_:)), keyEquivalent: "")
        item24h.target = self
        shareSubmenu.addItem(item24h)

        let item7d = NSMenuItem(title: "⏱️ 7 Tage", action: #selector(copyLink7d(_:)), keyEquivalent: "")
        item7d.target = self
        shareSubmenu.addItem(item7d)

        let item30d = NSMenuItem(title: "⏱️ 30 Tage", action: #selector(copyLink30d(_:)), keyEquivalent: "")
        item30d.target = self
        shareSubmenu.addItem(item30d)

        shareSubmenu.addItem(NSMenuItem.separator())

        let itemPerm = NSMenuItem(title: "♾️ Dauerhaft (Kein Ablauf)", action: #selector(copyLinkPermanent(_:)), keyEquivalent: "")
        itemPerm.target = self
        shareSubmenu.addItem(itemPerm)

        let parentItem = NSMenuItem(title: "🔗 R2 Freigabelink erstellen", action: nil, keyEquivalent: "")
        parentItem.submenu = shareSubmenu
        menu.addItem(parentItem)

        return menu
    }

    @objc func copyLink1h(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: 1)
    }

    @objc func copyLink24h(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: 24)
    }

    @objc func copyLink7d(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: 168)
    }

    @objc func copyLink30d(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: 720)
    }

    @objc func copyLinkPermanent(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: nil)
    }

    private func createAndCopyShareLink(ttlHours: Int?) {
        guard let items = FIFinderSyncController.default().selectedItemURLs(), let item = items.first else { return }
        let defaults = UserDefaults(suiteName: "com.r2sync.app") ?? UserDefaults.standard
        let syncFolderPath = defaults.string(forKey: "r2_sync_folder_path") ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Documents/EasyFisk-Docs")
        var publicDomainURL = defaults.string(forKey: "r2_public_domain_url") ?? "https://drive.ocpp-labs.com"

        if publicDomainURL.contains("ocpp-labs.com") && !publicDomainURL.contains("drive.ocpp-labs.com") {
            publicDomainURL = "https://drive.ocpp-labs.com"
        }

        if publicDomainURL.hasSuffix("/") {
            publicDomainURL = String(publicDomainURL.dropLast())
        }

        let rootURL = URL(fileURLWithPath: syncFolderPath)
        var relativePath = String(item.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

        guard let apiURL = URL(string: "\(publicDomainURL)/api/share") else { return }

        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var isDirectory: ObjCBool = false
        FileManager.default.fileExists(atPath: item.path, isDirectory: &isDirectory)

        let payload: [String: Any?] = [
            "filePath": relativePath,
            "isFolder": isDirectory.boolValue,
            "ttlHours": ttlHours
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: payload.compactMapValues { $0 })

        let semaphore = DispatchSemaphore(value: 0)
        var shareUrlToCopy = ""

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            defer { semaphore.signal() }
            if let data = data,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let urlStr = json["shareUrl"] as? String {
                shareUrlToCopy = urlStr
            } else {
                print("[FinderSync] API call failed, error: \(String(describing: error))")
            }
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 5.0)

        if shareUrlToCopy.isEmpty {
            shareUrlToCopy = "\(publicDomainURL)/s/\(relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? relativePath)"
        }

        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.declareTypes([.string], owner: nil)
        pasteboard.setString(shareUrlToCopy, forType: .string)
    }
}
