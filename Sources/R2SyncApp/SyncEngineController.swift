import Foundation
import Combine
import Network
import AppKit

struct LocalFileMetadata: Codable {
    let relativePath: String
    let size: Int64
    let modificationDate: Date
}

final class SyncEngineController: ObservableObject, FSEventsWatcherDelegate, @unchecked Sendable {
    static let shared = SyncEngineController()

    @Published var isSyncing: Bool = false
    @Published var activeTransfers: [TransferItem] = []
    @Published var isOffline: Bool = false

    private var watcher: FSEventsWatcher?
    private let storageService = R2StorageService()
    private var config: R2Config = R2Config.empty
    private var syncTimer: Timer?
    private var isPerformingFullSync = false
    private var isSleeping: Bool = false

    // Network & System State Observers
    private let networkMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.r2sync.networkmonitor")
    private var localIndexCache: [String: LocalFileMetadata] = [:]
    private var pendingLocalChanges: Set<String> = []

    private init() {
        setupSystemObservers()
        setupNetworkMonitor()
    }

    deinit {
        networkMonitor.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - System & Network Observers

    private func setupSystemObservers() {
        let nc = NSWorkspace.shared.notificationCenter
        nc.addObserver(self, selector: #selector(handleSystemSleep), name: NSWorkspace.willSleepNotification, object: nil)
        nc.addObserver(self, selector: #selector(handleSystemWake), name: NSWorkspace.didWakeNotification, object: nil)
    }

    private func setupNetworkMonitor() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let offline = (path.status != .satisfied)
            DispatchQueue.main.async {
                if self.isOffline != offline {
                    self.isOffline = offline
                    print("[SyncEngineController] Network status changed. Offline: \(offline)")
                    if !offline && !self.isSleeping {
                        // Reconnected online -> Trigger smart sync
                        Task {
                            await self.performFullTwoWaySync()
                        }
                    }
                }
            }
        }
        networkMonitor.start(queue: monitorQueue)
    }

    @objc private func handleSystemSleep() {
        print("[SyncEngineController] System will sleep. Halting engine to allow Deep Sleep...")
        isSleeping = true
        pauseEngineForSleep()
    }

    @objc private func handleSystemWake() {
        print("[SyncEngineController] System woke up. Resuming engine...")
        isSleeping = false
        resumeEngineAfterWake()
    }

    private func pauseEngineForSleep() {
        watcher?.stop()
        syncTimer?.invalidate()
        syncTimer = nil
        DispatchQueue.main.async {
            self.isSyncing = false
            self.activeTransfers.removeAll()
        }
    }

    private func resumeEngineAfterWake() {
        guard !config.syncFolderPath.isEmpty else { return }
        watcher?.start()
        if !isOffline {
            Task {
                await performFullTwoWaySync()
            }
            scheduleAdaptiveSyncTimer()
        }
    }

    // MARK: - Engine Lifecycle

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

        // Index local files into memory cache
        rebuildLocalIndexCache()

        // Perform initial sync if online & not sleeping
        if !isOffline && !isSleeping {
            Task {
                await performFullTwoWaySync()
            }
            scheduleAdaptiveSyncTimer()
        }
    }

    func stopEngine() {
        watcher?.stop()
        watcher = nil
        syncTimer?.invalidate()
        syncTimer = nil
        print("[SyncEngineController] Engine stopped")
    }

    private func scheduleAdaptiveSyncTimer() {
        DispatchQueue.main.async {
            self.syncTimer?.invalidate()
            // Adaptive timer: 30s instead of aggressive 10s polling, skipped automatically if offline or sleeping
            self.syncTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
                guard let self = self, !self.isOffline, !self.isSleeping else { return }
                Task {
                    await self.performFullTwoWaySync()
                }
            }
        }
    }

    // MARK: - FSEventsWatcherDelegate (Local Changes Detection)

    func fileSystemWatcher(_ watcher: FSEventsWatcher, didDetectChangeAt path: String, flags: FSEventStreamEventFlags) {
        print("[SyncEngineController] Change detected at path: \(path)")
        let url = URL(fileURLWithPath: path)
        let rootURL = URL(fileURLWithPath: config.syncFolderPath)

        guard url.path.hasPrefix(rootURL.path) else { return }

        var relativePath = String(url.path.dropFirst(rootURL.path.count))
        if relativePath.hasPrefix("/") {
            relativePath = String(relativePath.dropFirst())
        }

        guard !relativePath.isEmpty,
              !relativePath.hasPrefix("."),
              !relativePath.contains("/."),
              !relativePath.hasSuffix(".textClipping"),
              !relativePath.hasSuffix(".tmp"),
              !relativePath.hasSuffix(".download"),
              !relativePath.hasSuffix(".part") else { return }

        Task {
            var isDirectory: ObjCBool = false
            let exists = FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)

            if exists {
                if isDirectory.boolValue {
                    await syncDirectoryRecursively(directoryURL: url)
                } else {
                    await processLocalUpload(fileURL: url, relativePath: relativePath)
                }
            } else {
                // FILE DELETED LOCALLY ON MAC -> DELETE IN R2 BUCKET & WEB DB
                await processLocalDeletion(relativePath: relativePath)
            }
        }
    }

    // MARK: - Local Index & Reconciler Helpers

    private func rebuildLocalIndexCache() {
        guard !config.syncFolderPath.isEmpty else { return }
        let rootURL = URL(fileURLWithPath: config.syncFolderPath)
        let fileManager = FileManager.default

        guard let enumerator = fileManager.enumerator(at: rootURL, includingPropertiesForKeys: [.isRegularFileKey, .contentModificationDateKey, .fileSizeKey], options: [.skipsHiddenFiles]) else { return }

        var newCache: [String: LocalFileMetadata] = [:]
        for case let fileURL as URL in enumerator {
            var isDirectory: ObjCBool = false
            if fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue {
                var relPath = String(fileURL.path.dropFirst(rootURL.path.count))
                if relPath.hasPrefix("/") { relPath = String(relPath.dropFirst()) }

                if let attrs = try? fileManager.attributesOfItem(atPath: fileURL.path),
                   let size = attrs[.size] as? Int64,
                   let modDate = attrs[.modificationDate] as? Date {
                    newCache[relPath] = LocalFileMetadata(relativePath: relPath, size: size, modificationDate: modDate)
                }
            }
        }
        self.localIndexCache = newCache
        print("[SyncEngineController] Local index cache rebuilt with \(newCache.count) items.")
    }

    // MARK: - Local Action Processors

    private func processLocalUpload(fileURL: URL, relativePath: String) async {
        guard !isOffline && !isSleeping else {
            print("[SyncEngineController] Offline or sleeping. Queuing local change: \(relativePath)")
            pendingLocalChanges.insert(relativePath)
            return
        }

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

            // Update local cache
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let size = attrs[.size] as? Int64,
               let modDate = attrs[.modificationDate] as? Date {
                self.localIndexCache[relativePath] = LocalFileMetadata(relativePath: relativePath, size: size, modificationDate: modDate)
            }

            // Notify Web App to index in SQLite
            await notifyWebSync(action: "upload", relativePath: relativePath)

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

    private func processLocalDeletion(relativePath: String) async {
        self.localIndexCache.removeValue(forKey: relativePath)
        guard !isOffline && !isSleeping else { return }

        print("[SyncEngineController] Processing local deletion of \(relativePath)...")
        do {
            try await storageService.deleteFile(relativePath: relativePath, bucketName: config.bucketName)
            await notifyWebSync(action: "delete", relativePath: relativePath)
        } catch {
            print("[SyncEngineController] Remote delete failed for \(relativePath): \(error)")
        }
    }

    // MARK: - 2-Way Synchronization Engine (Remote <-> Local)

    struct WebFileItem: Codable {
        let id: String
        let path: String
        let filename: String
        let size: Int64
        let etag: String?
        let updatedAt: Int64
    }

    struct APIResponse: Codable {
        let files: [WebFileItem]
        let deletedFiles: [String]?
    }

    private func fetchRemoteStateFromDB() async -> (files: [WebFileItem], deletedFiles: [String]) {
        guard !isOffline && !isSleeping else { return ([], []) }

        let domain = config.publicDomainURL.isEmpty ? "https://drive.ocpp-labs.com" : config.publicDomainURL
        let cleanDomain = domain.hasSuffix("/") ? String(domain.dropLast()) : domain
        guard let url = URL(string: "\(cleanDomain)/api/files") else { return ([], []) }

        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 {
                let res = try JSONDecoder().decode(APIResponse.self, from: data)
                return (res.files, res.deletedFiles ?? [])
            }
        } catch {
            print("[SyncEngineController] Failed to fetch files from DB API: \(error)")
        }
        return ([], [])
    }

    private func performFullTwoWaySync() async {
        guard !isOffline && !isSleeping else {
            print("[SyncEngineController] Skipping full 2-way sync (Offline: \(isOffline), Sleeping: \(isSleeping))")
            return
        }
        guard !isPerformingFullSync else { return }
        isPerformingFullSync = true
        defer { isPerformingFullSync = false }

        let rootURL = URL(fileURLWithPath: config.syncFolderPath)
        let fileManager = FileManager.default

        do {
            // 1. Fetch remote state (active files & deleted files list)
            let remoteState = await fetchRemoteStateFromDB()
            let remoteFiles = remoteState.files
            let deletedPaths = Set(remoteState.deletedFiles)
            let remoteMap = Dictionary(uniqueKeysWithValues: remoteFiles.map { ($0.path, $0) })

            // 2. REMOTE DELETION -> LOCAL: Delete local files that were marked as deleted in DB
            for deletedKey in deletedPaths {
                let localURL = rootURL.appendingPathComponent(deletedKey)
                if fileManager.fileExists(atPath: localURL.path) {
                    print("[SyncEngineController] File marked as deleted in Web UI: \(deletedKey). Deleting locally on Mac...")
                    try? fileManager.removeItem(at: localURL)
                    self.localIndexCache.removeValue(forKey: deletedKey)
                }
            }

            // 3. REMOTE -> LOCAL: Download files present in DB but missing locally
            for item in remoteFiles {
                let localURL = rootURL.appendingPathComponent(item.path)
                var shouldDownload = false

                if let cached = self.localIndexCache[item.path] {
                    if cached.size != item.size {
                        shouldDownload = true
                    }
                } else if !fileManager.fileExists(atPath: localURL.path) {
                    shouldDownload = true
                } else if let attrs = try? fileManager.attributesOfItem(atPath: localURL.path),
                          let fileSize = attrs[.size] as? Int64,
                          fileSize != item.size {
                    shouldDownload = true
                }

                if shouldDownload {
                    print("[SyncEngineController] Remote file sync needed for: \(item.path). Downloading to Mac...")
                    DispatchQueue.main.async {
                        self.isSyncing = true
                        self.activeTransfers.append(TransferItem(filename: item.path, progress: 0.5, isUpload: false))
                    }
                    try? await storageService.downloadFile(relativePath: item.path, bucketName: config.bucketName, destinationURL: localURL)
                    if let attrs = try? fileManager.attributesOfItem(atPath: localURL.path),
                       let size = attrs[.size] as? Int64,
                       let modDate = attrs[.modificationDate] as? Date {
                        self.localIndexCache[item.path] = LocalFileMetadata(relativePath: item.path, size: size, modificationDate: modDate)
                    }
                    DispatchQueue.main.async {
                        self.activeTransfers.removeAll(where: { $0.filename == item.path })
                        if self.activeTransfers.isEmpty { self.isSyncing = false }
                    }
                }
            }

            // 4. LOCAL -> REMOTE SYNC: Fast Index comparison
            if let enumerator = fileManager.enumerator(at: rootURL, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) {
                for case let localFileURL as URL in enumerator {
                    var isDirectory: ObjCBool = false
                    if fileManager.fileExists(atPath: localFileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue {
                        var relPath = String(localFileURL.path.dropFirst(rootURL.path.count))
                        if relPath.hasPrefix("/") { relPath = String(relPath.dropFirst()) }
                        
                        let isIgnored = relPath.isEmpty ||
                                        relPath.hasPrefix(".") ||
                                        relPath.contains("/.") ||
                                        relPath.hasSuffix(".textClipping") ||
                                        relPath.hasSuffix(".tmp") ||
                                        relPath.hasSuffix(".download") ||
                                        relPath.hasSuffix(".part")

                        if !isIgnored && !deletedPaths.contains(relPath) {
                            var needsUpload = false
                            if let remoteItem = remoteMap[relPath] {
                                if let cached = self.localIndexCache[relPath] {
                                    if cached.size != remoteItem.size {
                                        needsUpload = true
                                    }
                                } else if let attrs = try? fileManager.attributesOfItem(atPath: localFileURL.path),
                                          let localSize = attrs[.size] as? Int64,
                                          localSize != remoteItem.size {
                                    needsUpload = true
                                }
                            } else {
                                needsUpload = true
                            }

                            if needsUpload {
                                print("[SyncEngineController] New/Modified local file detected: \(relPath). Uploading...")
                                await processLocalUpload(fileURL: localFileURL, relativePath: relPath)
                            }
                        }
                    }
                }
            }
        } catch {
            print("[SyncEngineController] Full 2-Way Sync failed: \(error)")
        }
    }

    private func syncDirectoryRecursively(directoryURL: URL) async {
        guard !isOffline && !isSleeping else { return }
        let fileManager = FileManager.default
        guard let enumerator = fileManager.enumerator(
            at: directoryURL,
            includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return }

        for case let fileURL as URL in enumerator {
            var isDirectory: ObjCBool = false
            if fileManager.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue {
                let rootURL = URL(fileURLWithPath: config.syncFolderPath)
                var relPath = String(fileURL.path.dropFirst(rootURL.path.count))
                if relPath.hasPrefix("/") { relPath = String(relPath.dropFirst()) }
                await processLocalUpload(fileURL: fileURL, relativePath: relPath)
            }
        }
    }

    private func notifyWebSync(action: String, relativePath: String) async {
        guard !isOffline && !isSleeping else { return }
        let domain = config.publicDomainURL.isEmpty ? "https://drive.ocpp-labs.com" : config.publicDomainURL
        let cleanDomain = domain.hasSuffix("/") ? String(domain.dropLast()) : domain
        
        let encodedPath = relativePath.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? relativePath
        let urlString = action == "delete" 
            ? "\(cleanDomain)/api/files?filePath=\(encodedPath)"
            : "\(cleanDomain)/api/files?forceSync=true"
            
        guard let url = URL(string: urlString) else { return }
        
        var request = URLRequest(url: url)
        request.httpMethod = action == "delete" ? "DELETE" : "GET"
        
        _ = try? await URLSession.shared.data(for: request)
    }
}

