#!/bin/swift
import Foundation
import AppKit

// CLI Tool to calculate relative R2 path and copy public link to clipboard
guard CommandLine.arguments.count > 1 else { exit(0) }

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)
let home = FileManager.default.homeDirectoryForCurrentUser
let rootURL = home.appendingPathComponent("Documents/EasyFisk-Docs")

var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
if relativePath.hasPrefix("/") { relativePath = String(relativePath.dropFirst()) }

// Read Worker Base URL if configured, default fallback
let workerBaseURL = "https://r2-share-worker.cloudflarestorage.workers.dev/s/"
let finalShareURL = workerBaseURL + relativePath

let pasteboard = NSPasteboard.general
pasteboard.clearContents()
pasteboard.setString(finalShareURL, forType: .string)

// Display User Notification
let notification = NSUserNotification()
notification.title = "R2Sync Share Link"
notification.subtitle = relativePath
notification.informativeText = "Öffentlicher Link in die Zwischenablage kopiert!"
NSUserNotificationCenter.default.deliver(notification)
