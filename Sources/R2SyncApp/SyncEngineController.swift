import Foundation
import Combine

final class SyncEngineController: ObservableObject, FSEventsWatcherDelegate, @unchecked Sendable {
    static let shared = SyncEngineController()

    @Published var isSyncing: Bool = false
    @Published var activeTransfers: [TransferItem] = []

    private var watcher: FSEventsWatcher?
    private let storageService = R2StorageService()
    private var config: R2Config = R2Config.empty

    private init() {}

    func startEngine(config: R2Config) {
        self.config = config
        guard !config.syncFolderPath.isEmpty else { return }

        // Initialize S3 Client
        do {
            try storageService.setupClient(config: config)
        } catch {
            print("[SyncEngineController] Failed to setup S3 Client: \(error)")
        }

        // Ensure local folder exists
        let manager = FileManager.default
        if !manager.fileExists(atPath: config.syncFolderPath) {
            try? manager.createDirectory(atPath: config.syncFolderPath, withIntermediateDirectories: true)
        }

        // Start FSEvents Watcher
        watcher?.stop()
        watcher = FSEventsWatcher(path: config.syncFolderPath)
        watcher?.delegate = self
        watcher?.start()

        print("[SyncEngineController] Engine started monitoring: \(config.syncFolderPath)")

        // Perform initial recursive sync scan for existing folders & files
        Task {
            await syncDirectoryRecursively(directoryURL: URL(fileURLWithPath: config.syncFolderPath))
        }
    }

    func stopEngine() {
        watcher?.stop()
        watcher = nil
        print("[SyncEngineController] Engine stopped")
    }

    // MARK: - FSEventsWatcherDelegate

    func fileSystemWatcher(_ watcher: FSEventsWatcher, didDetectChangeAt path: String, flags: FSEventStreamEventFlags) {
        print("[SyncEngineController] Change detected at path: \(path)")
        let url = URL(fileURLWithPath: path)

        Task {
            var isDirectory: ObjCBool = false
            if FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) {
                if isDirectory.boolValue {
                    await syncDirectoryRecursively(directoryURL: url)
                } else {
                    await processSingleFile(fileURL: url)
                }
            }
        }
    }

    // MARK: - Recursive Directory Sync Engine

    private func syncDirectoryRecursively(directoryURL: URL) async {
        let rootURL = URL(fileURLWithPath: config.syncFolderPath)
        let fileManager = FileManager.default

        guard let enumerator = fileManager.enumerator(
            at: directoryURL,
            includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        for case let fileURL as URL in enumerator {
            var isDirectory: ObjCBool = false
            if fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory) {
                if !isDirectory.boolValue {
                    await processSingleFile(fileURL: fileURL)
                }
            }
        }
    }

    private func processSingleFile(fileURL: URL) async {
        let rootURL = URL(fileURLWithPath: config.syncFolderPath)
        guard fileURL.path.hasPrefix(rootURL.path) else { return }

        var relativePath = String(fileURL.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") {
            relativePath = String(relativePath.dropFirst())
        }

        guard !relativePath.isEmpty, !relativePath.hasPrefix("."), !relativePath.contains("/.") else { return }

        DispatchQueue.main.async {
            if !self.activeTransfers.contains(where: { $0.filename == relativePath }) {
                self.isSyncing = true
                self.activeTransfers.append(TransferItem(filename: relativePath, progress: 0.5, isUpload: true))
            }
        }

        do {
            try await storageService.uploadFile(
                fileURL: fileURL,
                relativePath: relativePath,
                bucketName: config.bucketName
            )

            DispatchQueue.main.async {
                self.activeTransfers.removeAll(where: { $0.filename == relativePath })
                if self.activeTransfers.isEmpty {
                    self.isSyncing = false
                }
            }
        } catch {
            print("[SyncEngineController] Upload failed for \(relativePath): \(error)")
            DispatchQueue.main.async {
                self.activeTransfers.removeAll(where: { $0.filename == relativePath })
                if self.activeTransfers.isEmpty {
                    self.isSyncing = false
                }
            }
        }
    }
}
