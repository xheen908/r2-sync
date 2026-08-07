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

        let copy24hItem = NSMenuItem(title: "R2 Freigabelink kopieren (24h Ablauf)", action: #selector(copyExpiringLink24h(_:)), keyEquivalent: "")
        copy24hItem.target = self
        menu.addItem(copy24hItem)

        let copyPermanentItem = NSMenuItem(title: "Dauerhaften R2 Freigabelink kopieren", action: #selector(copyPermanentLink(_:)), keyEquivalent: "")
        copyPermanentItem.target = self
        menu.addItem(copyPermanentItem)

        return menu
    }

    @objc func copyExpiringLink24h(_ sender: AnyObject?) {
        createAndCopyShareLink(ttlHours: 24)
    }

    @objc func copyPermanentLink(_ sender: AnyObject?) {
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
