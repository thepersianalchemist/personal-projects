import Foundation

/// Message IDs from the GDL90 spec that we care about.
public enum GDL90MessageID: UInt8 {
    case heartbeat = 0x00
    case ownshipReport = 0x0A          // 10
    case ownshipGeometricAltitude = 0x0B // 11
    case trafficReport = 0x14          // 20
}

/// A decoded ownship position/velocity report (GDL90 message 10).
///
/// Field layout (byte indices relative to message start, index 0 = message ID),
/// per GDL90 spec Table 8 "Traffic / Ownship Report":
///   [0]      message ID (0x0A)
///   [1]      s/t  (alert status / address type)
///   [2..4]   participant address (24-bit)
///   [5..7]   latitude  (24-bit signed, 180/2^23 deg per LSB)
///   [8..10]  longitude (24-bit signed, 180/2^23 deg per LSB)
///   [11..12] altitude (12 bits, 25 ft/LSB, -1000 ft offset) + misc (4 bits)
///   [13]     NIC / NACp
///   [14..16] horizontal velocity (12 bits, kt) + vertical velocity (12 bits, 64 fpm/LSB signed)
///   [17]     track/heading (360/256 deg per LSB)
///   [18]     emitter category
///   [19..26] call sign (8 ASCII chars)
///   [27]     emergency/priority code + spare
public struct OwnshipReport: Equatable {
    public var latitudeDeg: Double
    public var longitudeDeg: Double
    /// Pressure altitude in feet (nil when the field is the 0xFFF "invalid" sentinel).
    public var pressureAltitudeFt: Double?
    /// Ground speed in knots (nil when the 0xFFF "no data" sentinel is present).
    public var groundSpeedKt: Double?
    /// Vertical speed in feet per minute (nil when the 0x800 "no data" sentinel is present).
    public var verticalSpeedFpm: Double?
    public var trackDeg: Double
    public var callSign: String

    static let degPerSemicircle = 180.0 / Double(1 << 23)

    public init?(message m: [UInt8]) {
        guard m.count >= 28, m[0] == GDL90MessageID.ownshipReport.rawValue
                || m[0] == GDL90MessageID.trafficReport.rawValue else { return nil }

        latitudeDeg = OwnshipReport.decodeLatLon(m[5], m[6], m[7])
        longitudeDeg = OwnshipReport.decodeLatLon(m[8], m[9], m[10])

        let altRaw = (UInt16(m[11]) << 4) | (UInt16(m[12]) >> 4)
        pressureAltitudeFt = (altRaw == 0xFFF) ? nil : Double(Int(altRaw) * 25 - 1000)

        let hvRaw = (UInt16(m[14]) << 4) | (UInt16(m[15]) >> 4)
        groundSpeedKt = (hvRaw == 0xFFF) ? nil : Double(hvRaw)

        let vvRaw = (UInt16(m[15] & 0x0F) << 8) | UInt16(m[16])
        if vvRaw == 0x800 {
            verticalSpeedFpm = nil
        } else {
            // 12-bit two's complement, 64 fpm per unit.
            let signed = (vvRaw & 0x800) != 0 ? Int(vvRaw) - 0x1000 : Int(vvRaw)
            verticalSpeedFpm = Double(signed * 64)
        }

        trackDeg = Double(m[17]) * (360.0 / 256.0)

        let nameBytes = Array(m[19..<27])
        callSign = String(bytes: nameBytes, encoding: .ascii)?
            .trimmingCharacters(in: .whitespaces) ?? ""
    }

    /// Decodes a 24-bit big-endian two's-complement semicircle value to degrees.
    static func decodeLatLon(_ b0: UInt8, _ b1: UInt8, _ b2: UInt8) -> Double {
        var v = (Int(b0) << 16) | (Int(b1) << 8) | Int(b2)
        if (v & 0x800000) != 0 { v -= 0x1000000 } // sign-extend 24-bit
        return Double(v) * degPerSemicircle
    }
}

/// Decoded GDL90 Ownship Geometric Altitude (message 11): GPS/geometric
/// altitude, which we prefer over pressure altitude for AGL estimation.
///   [0]    message ID (0x0B)
///   [1..2] geometric altitude (16-bit signed, 5 ft/LSB)
///   [3..4] vertical metrics
public struct OwnshipGeometricAltitude: Equatable {
    public var geometricAltitudeFt: Double

    public init?(message m: [UInt8]) {
        guard m.count >= 3, m[0] == GDL90MessageID.ownshipGeometricAltitude.rawValue
        else { return nil }
        let raw = (Int(m[1]) << 8) | Int(m[2])
        let signed = (raw & 0x8000) != 0 ? raw - 0x10000 : raw
        geometricAltitudeFt = Double(signed * 5)
    }
}

/// High-level decoded message union.
public enum GDL90Decoded: Equatable {
    case ownship(OwnshipReport)
    case geometricAltitude(OwnshipGeometricAltitude)
    case traffic(OwnshipReport)
    case other(id: UInt8)

    public init(message m: [UInt8]) {
        guard let id = m.first else { self = .other(id: 0); return }
        switch GDL90MessageID(rawValue: id) {
        case .ownshipReport:
            self = OwnshipReport(message: m).map(GDL90Decoded.ownship) ?? .other(id: id)
        case .trafficReport:
            self = OwnshipReport(message: m).map(GDL90Decoded.traffic) ?? .other(id: id)
        case .ownshipGeometricAltitude:
            self = OwnshipGeometricAltitude(message: m).map(GDL90Decoded.geometricAltitude) ?? .other(id: id)
        default:
            self = .other(id: id)
        }
    }
}
