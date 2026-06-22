import Foundation

/// CRC-16-CCITT (polynomial 0x1021) exactly as specified by the GDL90 data
/// interface specification (Garmin 560-1058-00). The two-byte FCS is appended
/// to every GDL90 message and transmitted least-significant byte first.
public enum CRC16CCITT {

    /// Precomputed 256-entry table, built per the algorithm in the GDL90 spec.
    private static let table: [UInt16] = {
        var t = [UInt16](repeating: 0, count: 256)
        for i in 0..<256 {
            var crc = UInt16(i) << 8
            for _ in 0..<8 {
                if (crc & 0x8000) != 0 {
                    crc = (crc << 1) ^ 0x1021
                } else {
                    crc = crc << 1
                }
            }
            t[i] = crc
        }
        return t
    }()

    /// Computes the FCS over the (unstuffed) message bytes: message ID + data.
    public static func compute<S: Sequence>(_ bytes: S) -> UInt16 where S.Element == UInt8 {
        var crc: UInt16 = 0
        for b in bytes {
            crc = table[Int(crc >> 8)] ^ (crc << 8) ^ UInt16(b)
        }
        return crc
    }
}
