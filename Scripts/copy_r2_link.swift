import Foundation
import AppKit

guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

let appDefaults = UserDefaults(suiteName: "com.r2sync.app")
let defaults = UserDefaults.standard

let syncFolderPath = appDefaults?.string(forKey: "r2_sync_folder_path") ?? defaults.string(forKey: "r2_sync_folder_path") ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Documents/EasyFisk-Docs")
var publicDomainURL = appDefaults?.string(forKey: "r2_public_domain_url") ?? defaults.string(forKey: "r2_public_domain_url") ?? "https://drive.ocpp-labs.com"

if publicDomainURL.contains("ocpp-labs.com") && !publicDomainURL.contains("drive.ocpp-labs.com") {
    publicDomainURL = "https://drive.ocpp-labs.com"
}

if publicDomainURL.hasSuffix("/") {
    publicDomainURL = String(publicDomainURL.dropLast())
}

let rootURL = URL(fileURLWithPath: syncFolderPath)

var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

// Check optional TTL argument (default 24h)
var ttlHours: Int? = 24
if CommandLine.arguments.count > 2, let parsedTTL = Int(CommandLine.arguments[2]) {
    ttlHours = parsedTTL == 0 ? nil : parsedTTL
}

// Call Web API POST /api/share
guard let apiURL = URL(string: "\(publicDomainURL)/api/share") else { exit(1) }

var request = URLRequest(url: apiURL)
request.httpMethod = "POST"
request.setValue("application/json", forHTTPHeaderField: "Content-Type")

let isFolder = (try? fileURL.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
let payload: [String: Any?] = [
    "filePath": relativePath,
    "isFolder": isFolder,
    "ttlHours": ttlHours
]

let semaphore = DispatchSemaphore(value: 0)
var generatedShareURL = ""

request.httpBody = try? JSONSerialization.data(withJSONObject: payload.compactMapValues { $0 })

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    defer { semaphore.signal() }
    guard let data = data,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let shareUrl = json["shareUrl"] as? String else { return }
    generatedShareURL = shareUrl
}
task.resume()
_ = semaphore.wait(timeout: .now() + 5.0)

if generatedShareURL.isEmpty {
    // Fallback if offline
    generatedShareURL = "\(publicDomainURL)/s/\(relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? relativePath)"
}

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.declareTypes([.string], owner: nil)
pasteboard.setString(generatedShareURL, forType: .string)

print("COPIED EXPIRING R2 SHARE LINK:", generatedShareURL)
