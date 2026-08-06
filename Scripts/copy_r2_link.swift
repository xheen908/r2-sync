import Foundation
import AppKit

guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

let defaults = UserDefaults.standard
let syncFolderPath = defaults.string(forKey: "r2_sync_folder_path") ?? (FileManager.default.homeDirectoryForCurrentUser.path + "/Documents/EasyFisk-Docs")
var publicDomainURL = defaults.string(forKey: "r2_public_domain_url") ?? "https://pub-7934cd421fb044609578237788351fae.r2.dev"

if !publicDomainURL.hasSuffix("/") {
    publicDomainURL += "/"
}

let rootURL = URL(fileURLWithPath: syncFolderPath)

var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

let finalShareURL = publicDomainURL + relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.declareTypes([.string], owner: nil)
pasteboard.setString(finalShareURL, forType: .string)

print("COPIED PUBLIC R2 LINK:", finalShareURL)
