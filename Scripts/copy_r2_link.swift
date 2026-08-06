import Foundation
import AppKit

guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)
let home = FileManager.default.homeDirectoryForCurrentUser
let rootURL = home.appendingPathComponent("Documents/EasyFisk-Docs")

var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

// Official Cloudflare R2 Public Domain
let r2PublicDomain = "https://pub-7934cd421fb044609578237788351fae.r2.dev/"
let finalShareURL = r2PublicDomain + relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.declareTypes([.string], owner: nil)
pasteboard.setString(finalShareURL, forType: .string)

print("COPIED R2 PUBLIC LINK:", finalShareURL)
