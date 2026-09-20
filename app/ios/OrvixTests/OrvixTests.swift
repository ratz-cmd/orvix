import XCTest
@testable import Orvix

final class OrvixTests: XCTestCase {
  func testCanonicalBundleIdentifier() {
    XCTAssertEqual(Bundle.main.bundleIdentifier, "com.orvix.app")
  }
}
