import Foundation
import CoreServices

protocol FSEventsWatcherDelegate: AnyObject {
    func fileSystemWatcher(_ watcher: FSEventsWatcher, didDetectChangeAt path: String, flags: FSEventStreamEventFlags)
}

final class FSEventsWatcher {
    weak var delegate: FSEventsWatcherDelegate?
    private var stream: FSEventStreamRef?
    private let path: String
    private var isWatching = false

    init(path: String) {
        self.path = path
    }

    deinit {
        stop()
    }

    func start() {
        guard !isWatching else { return }

        let pathsToWatch = [path] as CFArray
        var context = FSEventStreamContext(
            version: 0,
            info: Unmanaged.passUnretained(self).toOpaque(),
            retain: nil,
            release: nil,
            copyDescription: nil
        )

        let callback: FSEventStreamCallback = { (streamRef, clientCallBackInfo, numEvents, eventPaths, eventFlags, eventIds) in
            guard let clientCallBackInfo = clientCallBackInfo else { return }
            let watcher = Unmanaged<FSEventsWatcher>.fromOpaque(clientCallBackInfo).takeUnretainedValue()
            let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as! [String]

            for i in 0..<numEvents {
                let changedPath = paths[i]
                let flags = eventFlags[i]
                watcher.delegate?.fileSystemWatcher(watcher, didDetectChangeAt: changedPath, flags: flags)
            }
        }

        let flags = UInt32(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents)

        stream = FSEventStreamCreate(
            kCFAllocatorDefault,
            callback,
            &context,
            pathsToWatch,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0, // Latency in seconds (Debouncing)
            flags
        )

        if let stream = stream {
            FSEventStreamScheduleWithRunLoop(stream, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
            FSEventStreamStart(stream)
            isWatching = true
            print("[FSEventsWatcher] Started watching path: \(path)")
        }
    }

    func stop() {
        guard isWatching, let stream = stream else { return }
        FSEventStreamStop(stream)
        FSEventStreamInvalidate(stream)
        FSEventStreamRelease(stream)
        self.stream = nil
        isWatching = false
        print("[FSEventsWatcher] Stopped watching path: \(path)")
    }
}
