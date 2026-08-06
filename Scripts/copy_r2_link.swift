import Foundation
import AppKit

guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)
let home = FileManager.default.homeDirectoryForCurrentUser
let rootURL = home.appendingPathComponent("Documents/EasyFisk-Docs")

var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

let workerBaseURL = "https://r2-share-worker.cloudflarestorage.workers.dev/s/"
let finalShareURL = workerBaseURL + relativePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)!

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.declareTypes([.string], owner: nil)
pasteboard.setString(finalShareURL, forType: .string)

print("COPIED LINK:", finalShareURL)
