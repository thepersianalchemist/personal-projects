import Foundation

/// Wires the whole FlightCore pipeline together:
///
///   raw UDP datagram → GDL90Deframer → GDL90Decoded → GDL90SampleAssembler
///       → PhaseDetector → ChecklistController → DisplayState
///
/// Pure Foundation and fully testable: feed it framed GDL90 bytes (or
/// `OwnshipSample`s directly) and observe phase changes and display updates.
///
/// The companion iOS app owns one `FlightSession`, pushes Sentry datagrams into
/// `ingest(datagram:)`, forwards Neural Band gestures to the exposed controller
/// methods, and renders `onDisplayUpdate` on the glasses.
public final class FlightSession {

    public let detector: PhaseDetector
    public let controller: ChecklistController

    /// Fired whenever the rendered HUD state changes (item checked, segment
    /// switched). Render this on the glasses.
    public var onDisplayUpdate: ((DisplayState) -> Void)? {
        didSet { controller.onDisplayUpdate = onDisplayUpdate }
    }
    /// Fired on every confirmed flight-phase transition (for logging/telemetry).
    public var onPhaseChange: ((FlightPhase) -> Void)?

    private let deframer = GDL90Deframer()
    private let assembler: GDL90SampleAssembler

    public init(store: ChecklistStore,
                config: PhaseConfig = PhaseConfig(),
                clock: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.detector = PhaseDetector(config: config)
        self.controller = ChecklistController(store: store)
        self.assembler = GDL90SampleAssembler(clock: clock)

        detector.onChange = { [weak self] phase in
            // Auto-switch the checklist (forward-only inside the controller),
            // then notify observers.
            self?.controller.setPhase(phase)
            self?.onPhaseChange?(phase)
        }
    }

    // MARK: - Telemetry input

    /// Feeds one raw UDP datagram (a Sentry GDL90 packet on port 4000). Safe to
    /// call from the network queue; does no UI work itself.
    public func ingest(datagram bytes: [UInt8]) {
        for message in deframer.consume(bytes) {
            ingest(decoded: GDL90Decoded(message: message))
        }
    }

    /// Feeds an already-decoded GDL90 message (useful for replay harnesses).
    public func ingest(decoded: GDL90Decoded) {
        if let sample = assembler.ingest(decoded) {
            detector.ingest(sample)
        }
    }

    /// Feeds a source-agnostic sample directly (e.g. a future phone-GPS source).
    public func ingest(sample: OwnshipSample) {
        detector.ingest(sample)
    }

    // MARK: - Gesture passthrough (Neural Band / frame taps)

    public func advance() { controller.advance() }
    public func back() { controller.back() }
    public func toggle() { controller.toggle() }
    public func nextSegment() { controller.nextSegment() }
    public func prevSegment() { controller.prevSegment() }
    public func resetSegment() { controller.reset() }

    /// Current HUD snapshot.
    public var displayState: DisplayState { controller.state }
}
