import Foundation

/// Immutable snapshot of what the glasses should render right now. The
/// Ray-Ban Display layer is a pure function of this struct.
public struct DisplayState: Equatable {
    public var segmentId: String
    public var title: String
    public var items: [ChecklistItem]
    public var notes: [String]
    /// Index of the currently focused item, or nil if the segment is complete.
    public var focusedIndex: Int?
    public var isComplete: Bool
    /// Position of this segment within the card, for an "n / total" indicator.
    public var segmentIndex: Int
    public var segmentCount: Int

    public var focusedItem: ChecklistItem? {
        guard let i = focusedIndex, items.indices.contains(i) else { return nil }
        return items[i]
    }
}

/// Bridges phase detection, checklist data and user input into a single
/// `DisplayState`. The companion app:
///   1. forwards `PhaseDetector` transitions to `setPhase(_:)` (auto-switching)
///   2. forwards Neural Band / frame-tap gestures to advance / back / next / prev
///   3. renders `onDisplayUpdate` on the glasses
///
/// Auto-switching is forward-only: a detected phase never drags the HUD back to
/// an earlier segment (e.g. a momentary stop during run-up reporting "preflight"
/// must not jump back to Before Start). The pilot can always move manually.
public final class ChecklistController {

    public private(set) var state: DisplayState
    public var onDisplayUpdate: ((DisplayState) -> Void)?

    private let store: ChecklistStore
    /// Per-segment item state, parallel to `store.segments`, so check marks
    /// persist when switching back and forth.
    private var itemsBySegment: [[ChecklistItem]]
    private var current: Int
    private var focus: Int?

    public init(store: ChecklistStore, startAt segmentIndex: Int = 0) {
        self.store = store
        self.itemsBySegment = store.segments.map { $0.items }
        let start = store.segments.indices.contains(segmentIndex) ? segmentIndex : 0
        self.current = start
        self.focus = store.segments.isEmpty ? nil
            : ChecklistController.firstUnchecked(store.segments[start].items)
        self.state = ChecklistController.makeState(store: store,
                                                   items: itemsBySegment,
                                                   current: current,
                                                   focus: focus)
    }

    // MARK: - Auto switching

    /// Switches to the segment a detected phase maps to, forward-only.
    public func setPhase(_ phase: FlightPhase) {
        guard let target = store.segmentIndex(for: phase), target > current else { return }
        switchTo(target)
    }

    // MARK: - Manual navigation (gestures)

    /// Checks the focused item and advances; rolls into the next segment at the end.
    public func advance() {
        guard !store.segments.isEmpty else { return }
        if let i = focus, itemsBySegment[current].indices.contains(i) {
            itemsBySegment[current][i].isChecked = true
            if let next = ChecklistController.nextIndex(after: i, in: itemsBySegment[current]) {
                focus = next
                publish()
                return
            }
        }
        // Segment finished → move to the next one, else just publish completion.
        if current + 1 < store.segments.count { switchTo(current + 1) } else { focus = nil; publish() }
    }

    /// Moves focus to the previous item without changing its check state.
    public func back() {
        guard itemsBySegment.indices.contains(current) else { return }
        guard let i = focus else {
            focus = itemsBySegment[current].isEmpty ? nil : itemsBySegment[current].count - 1
            publish(); return
        }
        if i > 0 { focus = i - 1; publish() }
    }

    /// Jumps to the next checklist segment (e.g. tap-through on the ground).
    public func nextSegment() {
        if current + 1 < store.segments.count { switchTo(current + 1) }
    }

    /// Jumps to the previous checklist segment.
    public func prevSegment() {
        if current > 0 { switchTo(current - 1) }
    }

    /// Toggles the focused item's check state in place.
    public func toggle() {
        guard itemsBySegment.indices.contains(current),
              let i = focus, itemsBySegment[current].indices.contains(i) else { return }
        itemsBySegment[current][i].isChecked.toggle()
        publish()
    }

    /// Clears check marks for the current segment and returns focus to the top.
    public func reset() {
        guard itemsBySegment.indices.contains(current) else { return }
        for idx in itemsBySegment[current].indices { itemsBySegment[current][idx].isChecked = false }
        focus = itemsBySegment[current].isEmpty ? nil : 0
        publish()
    }

    // MARK: - Internals

    private func switchTo(_ index: Int) {
        guard store.segments.indices.contains(index), index != current else { return }
        current = index
        focus = ChecklistController.firstUnchecked(itemsBySegment[index])
        publish()
    }

    private func publish() {
        state = ChecklistController.makeState(store: store,
                                              items: itemsBySegment,
                                              current: current,
                                              focus: focus)
        onDisplayUpdate?(state)
    }

    private static func firstUnchecked(_ items: [ChecklistItem]) -> Int? {
        items.isEmpty ? nil : (items.firstIndex { !$0.isChecked } ?? 0)
    }

    private static func nextIndex(after i: Int, in items: [ChecklistItem]) -> Int? {
        items.indices.contains(i + 1) ? i + 1 : nil
    }

    private static func makeState(store: ChecklistStore,
                                  items: [[ChecklistItem]],
                                  current: Int,
                                  focus: Int?) -> DisplayState {
        guard store.segments.indices.contains(current) else {
            return DisplayState(segmentId: "", title: "", items: [], notes: [],
                                focusedIndex: nil, isComplete: false,
                                segmentIndex: 0, segmentCount: 0)
        }
        let seg = store.segments[current]
        let segItems = items[current]
        let complete = !segItems.isEmpty && segItems.allSatisfy { $0.isChecked }
        return DisplayState(segmentId: seg.id,
                            title: seg.title,
                            items: segItems,
                            notes: seg.notes,
                            focusedIndex: focus,
                            isComplete: complete,
                            segmentIndex: current,
                            segmentCount: store.segments.count)
    }
}
