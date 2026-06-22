import Foundation

/// Immutable snapshot of what the glasses should render right now. The
/// Ray-Ban Display layer is a pure function of this struct.
public struct DisplayState: Equatable {
    public var phase: FlightPhase
    public var title: String
    public var items: [ChecklistItem]
    /// Index of the currently focused item, or nil if there is no checklist /
    /// the list is complete.
    public var focusedIndex: Int?
    public var isComplete: Bool

    public var focusedItem: ChecklistItem? {
        guard let i = focusedIndex, items.indices.contains(i) else { return nil }
        return items[i]
    }
}

/// Bridges phase detection, checklist data and user input into a single
/// `DisplayState`. The companion app:
///   1. forwards `PhaseDetector` transitions to `setPhase(_:)`
///   2. forwards Neural Band / frame-tap gestures to advance/back/toggle
///   3. renders `onDisplayUpdate` on the glasses
public final class ChecklistController {

    public private(set) var state: DisplayState
    public var onDisplayUpdate: ((DisplayState) -> Void)?

    private let store: ChecklistStore
    private var currentPhase: FlightPhase
    private var items: [ChecklistItem]
    private var focused: Int?

    public init(store: ChecklistStore, initialPhase: FlightPhase = .preflight) {
        self.store = store
        self.currentPhase = initialPhase
        let list = store.checklist(for: initialPhase)
        self.items = list?.items ?? []
        self.focused = (list?.items.isEmpty == false) ? 0 : nil
        self.state = ChecklistController.makeState(phase: initialPhase,
                                                   title: list?.title ?? initialPhase.displayName,
                                                   items: items,
                                                   focused: focused)
    }

    /// Switches to a new phase's checklist, resetting focus and check marks.
    /// Idempotent: re-setting the current phase is a no-op so a steady phase
    /// doesn't wipe the pilot's progress.
    public func setPhase(_ phase: FlightPhase) {
        guard phase != currentPhase else { return }
        currentPhase = phase
        let list = store.checklist(for: phase)
        items = list?.items ?? []
        focused = items.isEmpty ? nil : 0
        publish(title: list?.title ?? phase.displayName)
    }

    /// Checks the focused item and advances to the next unchecked one.
    public func advance() {
        guard let i = focused, items.indices.contains(i) else { return }
        items[i].isChecked = true
        focused = items.indices.contains(i + 1) ? i + 1 : nil
        publish()
    }

    /// Moves focus to the previous item without changing check state.
    public func back() {
        guard let i = focused else {
            focused = items.isEmpty ? nil : items.count - 1
            publish()
            return
        }
        if i > 0 { focused = i - 1; publish() }
    }

    /// Toggles the focused item's check state in place.
    public func toggle() {
        guard let i = focused, items.indices.contains(i) else { return }
        items[i].isChecked.toggle()
        publish()
    }

    /// Clears all check marks and returns focus to the top.
    public func reset() {
        for idx in items.indices { items[idx].isChecked = false }
        focused = items.isEmpty ? nil : 0
        publish()
    }

    // MARK: - State plumbing

    private func publish(title: String? = nil) {
        let t = title ?? state.title
        state = ChecklistController.makeState(phase: currentPhase,
                                              title: t,
                                              items: items,
                                              focused: focused)
        onDisplayUpdate?(state)
    }

    private static func makeState(phase: FlightPhase,
                                  title: String,
                                  items: [ChecklistItem],
                                  focused: Int?) -> DisplayState {
        let complete = !items.isEmpty && items.allSatisfy { $0.isChecked }
        return DisplayState(phase: phase,
                            title: title,
                            items: items,
                            focusedIndex: focused,
                            isComplete: complete)
    }
}
