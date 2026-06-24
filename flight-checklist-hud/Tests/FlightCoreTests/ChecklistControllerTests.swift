import XCTest
@testable import FlightCore

final class ChecklistControllerTests: XCTestCase {

    private func makeStore() -> ChecklistStore {
        ChecklistStore(segments: [
            ChecklistSegment(id: "ground", title: "Ground", autoPhases: [.preflight], items: [
                ChecklistItem(id: "a", challenge: "Brake", response: "SET"),
                ChecklistItem(id: "b", challenge: "Master", response: "ON")
            ]),
            ChecklistSegment(id: "manual", title: "Run Up", autoPhases: [], items: [
                ChecklistItem(id: "m", challenge: "Mags", response: "CHECK")
            ]),
            ChecklistSegment(id: "climb", title: "Climb", autoPhases: [.afterTakeoff, .climb], items: [
                ChecklistItem(id: "c1", challenge: "Flaps", response: "UP"),
                ChecklistItem(id: "c2", challenge: "Power", response: "CLIMB")
            ]),
            ChecklistSegment(id: "cruise", title: "Cruise", autoPhases: [.cruise], items: [
                ChecklistItem(id: "d", challenge: "Mixture", response: "LEAN")
            ])
        ])
    }

    func testBundledCessnaChecklistLoads() throws {
        let store = try ChecklistStore.bundled()
        XCTAssertEqual(store.segments.count, 11)
        XCTAssertEqual(store.segments.first?.id, "before_start")
        // After-takeoff telemetry maps to the Climb segment.
        let climbIdx = try XCTUnwrap(store.segmentIndex(for: .afterTakeoff))
        XCTAssertEqual(store.segments[climbIdx].title, "Climb")
        XCTAssertEqual(store.segmentIndex(for: .preflight).map { store.segments[$0].id }, "before_start")
        XCTAssertEqual(store.segmentIndex(for: .shutdown).map { store.segments[$0].id }, "shutdown")

        // Ground-only segments have no auto phase: no detected phase reaches them.
        let autoReachable = Set(FlightPhase.allCases.compactMap { store.segmentIndex(for: $0) })
        for groundOnly in ["engine_start", "after_start", "run_up"] {
            let idx = try XCTUnwrap(store.segments.firstIndex { $0.id == groundOnly })
            XCTAssertFalse(autoReachable.contains(idx), "\(groundOnly) must be manual-only")
        }
    }

    func testAdvanceChecksAndRollsIntoNextSegment() {
        let c = ChecklistController(store: makeStore())
        XCTAssertEqual(c.state.segmentId, "ground")
        XCTAssertEqual(c.state.focusedIndex, 0)

        c.advance()                       // checks "a", focus -> 1
        XCTAssertTrue(c.state.items[0].isChecked)
        XCTAssertEqual(c.state.focusedIndex, 1)

        c.advance()                       // checks "b" (last) -> roll to next segment
        XCTAssertEqual(c.state.segmentId, "manual")
        XCTAssertEqual(c.state.segmentIndex, 1)
        XCTAssertEqual(c.state.focusedIndex, 0)
    }

    func testSetPhaseIsForwardOnly() {
        let c = ChecklistController(store: makeStore())
        c.setPhase(.cruise)               // jump straight to cruise (index 3)
        XCTAssertEqual(c.state.segmentId, "cruise")

        c.setPhase(.afterTakeoff)         // maps to climb (index 2) < 3 -> ignored
        XCTAssertEqual(c.state.segmentId, "cruise")

        c.setPhase(.preflight)            // maps to ground (index 0) < 3 -> ignored
        XCTAssertEqual(c.state.segmentId, "cruise")
    }

    func testManualSegmentNavigation() {
        let c = ChecklistController(store: makeStore())
        c.nextSegment()
        XCTAssertEqual(c.state.segmentId, "manual")
        c.nextSegment()
        XCTAssertEqual(c.state.segmentId, "climb")
        c.prevSegment()
        XCTAssertEqual(c.state.segmentId, "manual")
    }

    func testCheckStatePersistsAcrossSwitches() {
        let c = ChecklistController(store: makeStore())
        c.toggle()                        // check "a" in ground
        c.nextSegment()                   // -> manual
        c.prevSegment()                   // back to ground
        XCTAssertTrue(c.state.items[0].isChecked, "progress preserved on return")
        XCTAssertEqual(c.state.focusedIndex, 1, "focus skips the already-checked item")
    }

    func testToggleAndReset() {
        let c = ChecklistController(store: makeStore())
        c.toggle()
        XCTAssertTrue(c.state.items[0].isChecked)
        c.reset()
        XCTAssertFalse(c.state.items.contains { $0.isChecked })
        XCTAssertEqual(c.state.focusedIndex, 0)
    }

    func testDisplayUpdateCallbackFires() {
        let c = ChecklistController(store: makeStore())
        var updates = 0
        c.onDisplayUpdate = { _ in updates += 1 }
        c.advance()
        c.setPhase(.cruise)
        XCTAssertEqual(updates, 2)
    }
}
