import Foundation

/// Low-level GDL90 framing: flag bytes, byte-stuffing and FCS handling.
///
/// A message on the wire is:
///   0x7E | <stuffed: messageID + data + FCS-lo + FCS-hi> | 0x7E
/// where any 0x7E or 0x7D byte in the payload is escaped as 0x7D followed by
/// (byte XOR 0x20).
public enum GDL90Framing {

    public static let flag: UInt8 = 0x7E
    public static let escape: UInt8 = 0x7D
    public static let escapeXor: UInt8 = 0x20

    public enum FrameError: Error, Equatable {
        case tooShort
        case badCRC(expected: UInt16, computed: UInt16)
        case danglingEscape
    }

    /// Wraps `message` (messageID + data, WITHOUT FCS) into a complete framed,
    /// byte-stuffed GDL90 packet ready to transmit. Useful for tests and for a
    /// future "broadcast ownship to ForeFlight" feature.
    public static func frame(_ message: [UInt8]) -> [UInt8] {
        let fcs = CRC16CCITT.compute(message)
        var raw = message
        raw.append(UInt8(fcs & 0x00FF))        // FCS low byte first
        raw.append(UInt8((fcs >> 8) & 0x00FF)) // then high byte

        var out: [UInt8] = [flag]
        for b in raw {
            if b == flag || b == escape {
                out.append(escape)
                out.append(b ^ escapeXor)
            } else {
                out.append(b)
            }
        }
        out.append(flag)
        return out
    }

    /// Removes byte-stuffing from a payload that has already had its 0x7E flag
    /// bytes stripped.
    public static func unstuff(_ stuffed: ArraySlice<UInt8>) throws -> [UInt8] {
        var out: [UInt8] = []
        out.reserveCapacity(stuffed.count)
        var iterator = stuffed.makeIterator()
        while let b = iterator.next() {
            if b == escape {
                guard let next = iterator.next() else { throw FrameError.danglingEscape }
                out.append(next ^ escapeXor)
            } else {
                out.append(b)
            }
        }
        return out
    }

    /// Validates and strips the trailing 2-byte FCS from an unstuffed message,
    /// returning just (messageID + data).
    public static func validateAndStripFCS(_ unstuffed: [UInt8]) throws -> [UInt8] {
        guard unstuffed.count >= 3 else { throw FrameError.tooShort }
        let message = Array(unstuffed[0..<(unstuffed.count - 2)])
        let received = UInt16(unstuffed[unstuffed.count - 2])
            | (UInt16(unstuffed[unstuffed.count - 1]) << 8)
        let computed = CRC16CCITT.compute(message)
        guard received == computed else {
            throw FrameError.badCRC(expected: received, computed: computed)
        }
        return message
    }
}

/// Incrementally consumes a byte stream (e.g. UDP datagrams) and emits complete,
/// CRC-validated GDL90 messages (messageID + data, FCS already stripped).
///
/// This is deliberately tolerant: malformed or bad-CRC frames are dropped rather
/// than throwing, because in flight we never want a single corrupt datagram to
/// stall the pipeline.
public final class GDL90Deframer {

    private var buffer: [UInt8] = []
    private var inFrame = false

    public init() {}

    /// Feeds raw bytes and returns any messages that completed within them.
    public func consume(_ bytes: [UInt8]) -> [[UInt8]] {
        var messages: [[UInt8]] = []
        for b in bytes {
            if b == GDL90Framing.flag {
                if inFrame, !buffer.isEmpty {
                    if let msg = try? decodeBuffer() { messages.append(msg) }
                    buffer.removeAll(keepingCapacity: true)
                    inFrame = false
                } else {
                    // Opening flag (or back-to-back flags); start fresh.
                    buffer.removeAll(keepingCapacity: true)
                    inFrame = true
                }
            } else if inFrame {
                buffer.append(b)
            }
        }
        return messages
    }

    private func decodeBuffer() throws -> [UInt8] {
        let unstuffed = try GDL90Framing.unstuff(buffer[...])
        return try GDL90Framing.validateAndStripFCS(unstuffed)
    }
}
