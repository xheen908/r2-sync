import XCTest
@testable import R2SyncApp

final class R2SyncAppTests: XCTestCase {
    func testConfigManagerDefault() {
        XCTAssertFalse(ConfigManager.shared.isConfigured)
    }
}
