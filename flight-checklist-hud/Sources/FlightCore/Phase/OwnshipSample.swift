import Foundation

/// A source-agnostic snapshot of own-aircraft state. The phase detector consumes
/// only this, so the data can come from a GDL90/ADS-B receiver today or the
/// phone's own GPS later without changing the detection logic.
public struct OwnshipSample: Equatable {
    public var timestamp: TimeInterval
    public var latitudeDeg: Double?
    public var longitudeDeg: Double?
    /// Best available altitude in feet MSL (geometric preferred, else pressure).
    public var altitudeFt: Double?
    public var groundSpeedKt: Double?
    public var verticalSpeedFpm: Double?
    public var trackDeg: Double?

    public init(timestamp: TimeInterval,
                latitudeDeg: Double? = nil,
                longitudeDeg: Double? = nil,
                altitudeFt: Double? = nil,
                groundSpeedKt: Double? = nil,
                verticalSpeedFpm: Double? = nil,
                trackDeg: Double? = nil) {
        self.timestamp = timestamp
        self.latitudeDeg = latitudeDeg
        self.longitudeDeg = longitudeDeg
        self.altitudeFt = altitudeFt
        self.groundSpeedKt = groundSpeedKt
        self.verticalSpeedFpm = verticalSpeedFpm
        self.trackDeg = trackDeg
    }
}

/// Merges the GDL90 message stream into unified `OwnshipSample`s. Ownship reports
/// (msg 10) carry position/velocity; geometric-altitude messages (msg 11) arrive
/// separately, so we cache the latest geometric altitude and prefer it over the
/// report's pressure altitude.
public final class GDL90SampleAssembler {
    private var latestGeometricAltFt: Double?
    private let clock: () -> TimeInterval

    /// - Parameter clock: supplies the timestamp for emitted samples. Injectable
    ///   for deterministic tests; defaults to wall-clock seconds.
    public init(clock: @escaping () -> TimeInterval = { Date().timeIntervalSince1970 }) {
        self.clock = clock
    }

    /// Folds one decoded GDL90 message into the running state. Returns a sample
    /// only for ownship reports (the messages that define a new fix).
    public func ingest(_ decoded: GDL90Decoded) -> OwnshipSample? {
        switch decoded {
        case .geometricAltitude(let geo):
            latestGeometricAltFt = geo.geometricAltitudeFt
            return nil
        case .ownship(let r):
            return OwnshipSample(
                timestamp: clock(),
                latitudeDeg: r.latitudeDeg,
                longitudeDeg: r.longitudeDeg,
                altitudeFt: latestGeometricAltFt ?? r.pressureAltitudeFt,
                groundSpeedKt: r.groundSpeedKt,
                verticalSpeedFpm: r.verticalSpeedFpm,
                trackDeg: r.trackDeg
            )
        case .traffic, .other:
            return nil
        }
    }
}
