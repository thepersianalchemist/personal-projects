import Foundation

/// Implemented by the Ray-Ban Display layer (Meta Wearables Device Access
/// Toolkit). FlightCore stays UI-agnostic; the glasses code just consumes
/// `DisplayState`.
public protocol GlassesRenderer: AnyObject {
    func render(_ state: DisplayState)
}

/// Formats a `DisplayState` into compact lines suitable for the small in-lens
/// display. Keeps the focused item plus a few upcoming items in view — a full
/// 13-item checklist will not fit, so we window around the focus.
public enum DisplayFormatter {

    /// Header like `CLIMB  (7/11)`.
    public static func header(_ state: DisplayState) -> String {
        "\(state.title.uppercased())  (\(state.segmentIndex + 1)/\(state.segmentCount))"
    }

    /// Windowed item lines. `[x]` checked, `[ ]` unchecked, `›` marks focus.
    /// Right-aligns nothing (monospace assumed); response follows an em dash.
    public static func itemLines(_ state: DisplayState, window: Int = 5) -> [String] {
        guard !state.items.isEmpty else {
            return [state.isComplete ? "✓ complete" : "—"]
        }
        let focus = state.focusedIndex ?? state.items.count - 1
        let half = max(0, window - 1) / 2
        var start = max(0, focus - half)
        let end = min(state.items.count, start + window)
        start = max(0, end - window)

        return (start..<end).map { i in
            let item = state.items[i]
            let box = item.isChecked ? "[x]" : "[ ]"
            let cursor = (i == state.focusedIndex) ? "›" : " "
            return "\(cursor)\(box) \(item.challenge) — \(item.response)"
        }
    }

    /// Full multi-line block: header + windowed items (+ completion marker).
    public static func text(_ state: DisplayState, window: Int = 5) -> String {
        var lines = [header(state)]
        lines.append(contentsOf: itemLines(state, window: window))
        if state.isComplete { lines.append("✓ \(state.title) complete") }
        return lines.joined(separator: "\n")
    }
}
