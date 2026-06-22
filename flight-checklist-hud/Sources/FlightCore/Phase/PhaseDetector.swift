import Foundation

/// Tunable thresholds for phase detection. Defaults are reasonable for light GA;
/// expose these in the app so they can be tuned per aircraft.
public struct PhaseConfig: Sendable {
    /// Ground speed (kt) above which the aircraft is considered "moving".
    public var taxiSpeedKt: Double = 3
    /// Ground speed (kt) at/above which a ground roll is treated as a takeoff roll.
    public var rotateSpeedKt: Double = 35
    /// Height AGL (ft) above which the aircraft is considered airborne.
    public var airborneAglFt: Double = 50
    /// Ceiling (ft AGL) for the "after takeoff" phase before it becomes "climb".
    public var afterTakeoffCeilingFt: Double = 1000
    /// Vertical speed (fpm) above which the aircraft is climbing.
    public var climbVsFpm: Double = 300
    /// Vertical speed (fpm) below which the aircraft is descending.
    public var descentVsFpm: Double = -300
    /// Below this height AGL (ft), a descent is treated as an approach.
    public var approachCeilingFt: Double = 1500
    /// Above this height AGL (ft), sustained level flight is cruise.
    public var cruiseFloorFt: Double = 1000
    /// A candidate phase must persist this long (s) before it becomes active.
    /// Provides hysteresis against momentary GPS noise.
    public var minDwell: TimeInterval = 4

    public init() {}
}

/// Derives the current `FlightPhase` from a stream of `OwnshipSample`s.
///
/// Altitude is reported MSL, so we estimate AGL by auto-zeroing field elevation
/// while the aircraft sits stationary on the ground before the first departure.
public final class PhaseDetector {

    public private(set) var phase: FlightPhase = .preflight
    /// Called once per confirmed phase transition.
    public var onChange: ((FlightPhase) -> Void)?

    private let config: PhaseConfig
    private var groundElevationFt: Double?
    private var hasBeenAirborne = false
    private var candidate: (phase: FlightPhase, since: TimeInterval)?

    public init(config: PhaseConfig = PhaseConfig()) {
        self.config = config
    }

    /// Feeds one sample and returns the (possibly unchanged) current phase.
    @discardableResult
    public func ingest(_ s: OwnshipSample) -> FlightPhase {
        let gs = s.groundSpeedKt ?? 0
        let vs = s.verticalSpeedFpm ?? 0

        // Capture field elevation while stationary on the ground pre-departure.
        if gs < config.taxiSpeedKt, !hasBeenAirborne, let alt = s.altitudeFt {
            groundElevationFt = alt
        }

        let agl: Double? = {
            guard let alt = s.altitudeFt, let g = groundElevationFt else { return nil }
            return alt - g
        }()
        let airborne = (agl ?? 0) > config.airborneAglFt
        if airborne { hasBeenAirborne = true }

        let target = classify(gs: gs, vs: vs, agl: agl, airborne: airborne)
        applyHysteresis(target: target, now: s.timestamp)
        return phase
    }

    private func classify(gs: Double, vs: Double, agl: Double?, airborne: Bool) -> FlightPhase {
        if !hasBeenAirborne {
            if gs < config.taxiSpeedKt { return .preflight }
            if gs < config.rotateSpeedKt { return .taxiOut }
            return .takeoff
        }

        if airborne {
            let a = agl ?? .greatestFiniteMagnitude
            if vs > config.climbVsFpm {
                return a < config.afterTakeoffCeilingFt ? .afterTakeoff : .climb
            }
            if vs < config.descentVsFpm {
                return a < config.approachCeilingFt ? .approach : .descent
            }
            // Roughly level.
            return a > config.cruiseFloorFt ? .cruise : .approach
        }

        // On the ground again after having flown.
        if gs >= config.rotateSpeedKt * 0.6 { return .landing }
        if gs >= config.taxiSpeedKt { return .taxiIn }
        return .shutdown
    }

    private func applyHysteresis(target: FlightPhase, now: TimeInterval) {
        guard target != phase else { candidate = nil; return }
        if let c = candidate, c.phase == target {
            if now - c.since >= config.minDwell {
                phase = target
                candidate = nil
                onChange?(phase)
            }
        } else {
            candidate = (target, now)
        }
    }
}
