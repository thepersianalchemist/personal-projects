import XCTest
@testable import FlightCore

final class ChecklistControllerTests: XCTestCase {

    private func makeStore() -> ChecklistStore {
        ChecklistStore(checklists: [
            Checklist(phase: .afterTakeoff, title: "After Takeoff", items: [
                ChecklistItem(id: "1", challenge: "Gear", response: "UP"),
                ChecklistItem(id: "2", challenge: "Flaps", response: "UP"),
                ChecklistItem(id: "3", challenge: "Power", response: "CLIMB")
            ]),
            Checklist(phase: .cruise, title: "Cruise", items: [
                ChecklistItem(id: "c1", challenge: "Mixture", response: "LEAN")
            ])
        ])
    }

    func testBundledSamplesLoad() throws {
        let store = try ChecklistStore.bundledSamples()
        let list = try XCTUnwrap(store.checklist(for: .afterTakeoff))
        XCTAssertEqual(list.title, "After Takeoff")
        XCTAssertFalse(list.items.isEmpty)
    }

    func testAdvanceChecksAndMovesFocus() {
        let controller = ChecklistController(store: makeStore(), initialPhase: .afterTakeoff)
        XCTAssertEqual(controller.state.focusedIndex, 0)

        controller.advance()
        XCTAssertTrue(controller.state.items[0].isChecked)
        XCTAssertEqual(controller.state.focusedIndex, 1)

        controller.advance()
        controller.advance()
        XCTAssertNil(controller.state.focusedIndex, "focus clears after last item")
        XCTAssertTrue(controller.state.isComplete)
    }

    func testSetPhaseSwitchesChecklistAndResetsProgress() {
        let controller = ChecklistController(store: makeStore(), initialPhase: .afterTakeoff)
        controller.advance()
        controller.setPhase(.cruise)
        XCTAssertEqual(controller.state.phase, .cruise)
        XCTAssertEqual(controller.state.title, "Cruise")
        XCTAssertEqual(controller.state.focusedIndex, 0)
        XCTAssertFalse(controller.state.items[0].isChecked)
    }

    func testSetSamePhaseIsNoOpAndPreservesProgress() {
        let controller = ChecklistController(store: makeStore(), initialPhase: .afterTakeoff)
        controller.advance()
        controller.setPhase(.afterTakeoff) // same phase
        XCTAssertTrue(controller.state.items[0].isChecked, "progress preserved")
        XCTAssertEqual(controller.state.focusedIndex, 1)
    }

    func testToggleAndReset() {
        let controller = ChecklistController(store: makeStore(), initialPhase: .afterTakeoff)
        controller.toggle()
        XCTAssertTrue(controller.state.items[0].isChecked)
        controller.toggle()
        XCTAssertFalse(controller.state.items[0].isChecked)

        controller.advance()
        controller.reset()
        XCTAssertEqual(controller.state.focusedIndex, 0)
        XCTAssertFalse(controller.state.items.contains { $0.isChecked })
    }

    func testUpdateCallbackFires() {
        let controller = ChecklistController(store: makeStore(), initialPhase: .afterTakeoff)
        var updates = 0
        controller.onDisplayUpdate = { _ in updates += 1 }
        controller.advance()
        controller.setPhase(.cruise)
        XCTAssertEqual(updates, 2)
    }
}
