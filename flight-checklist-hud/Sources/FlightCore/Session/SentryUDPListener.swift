#if canImport(Network)
import Foundation
import Network

/// Listens for Sentry's GDL90 broadcast over WiFi and forwards each datagram.
///
/// Setup in flight: the Sentry creates its own WiFi network; connect the iPhone
/// to it (the same network ForeFlight uses). Sentry transmits GDL90 on **UDP
/// port 4000**. `allowLocalEndpointReuse` lets this app share port 4000 with
/// ForeFlight so both receive the broadcast.
///
/// iOS requires the **Local Network** privacy permission — add
/// `NSLocalNetworkUsageDescription` to Info.plist (see README).
@available(iOS 13.0, macOS 10.15, *)
public final class SentryUDPListener {

    public enum ListenerState {
        case ready
        case failed(Error)
        case cancelled
    }

    private var listener: NWListener?
    private var connections: [NWConnection] = []
    private let port: NWEndpoint.Port
    private let queue: DispatchQueue
    private let onDatagram: ([UInt8]) -> Void
    public var onStateChange: ((ListenerState) -> Void)?

    /// - Parameters:
    ///   - port: GDL90 UDP port. Sentry uses 4000 (ForeFlight reserves the right
    ///     to change it as advanced config), so it is configurable.
    ///   - onDatagram: called on `queue` with each raw datagram's bytes — pipe
    ///     straight into `FlightSession.ingest(datagram:)`.
    public init?(port: UInt16 = 4000,
                 queue: DispatchQueue = DispatchQueue(label: "FlightCore.SentryUDP"),
                 onDatagram: @escaping ([UInt8]) -> Void) {
        guard let p = NWEndpoint.Port(rawValue: port) else { return nil }
        self.port = p
        self.queue = queue
        self.onDatagram = onDatagram
    }

    public func start() throws {
        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true   // coexist with ForeFlight on :4000
        let listener = try NWListener(using: params, on: port)
        self.listener = listener

        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.onStateChange?(.ready)
            case .failed(let error): self?.onStateChange?(.failed(error))
            case .cancelled: self?.onStateChange?(.cancelled)
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.start(queue: queue)
    }

    private func accept(_ connection: NWConnection) {
        connections.append(connection)
        connection.start(queue: queue)
        receive(on: connection)
    }

    private func receive(on connection: NWConnection) {
        // UDP delivers one datagram per receiveMessage; loop to keep reading.
        connection.receiveMessage { [weak self] data, _, _, error in
            if let data, !data.isEmpty {
                self?.onDatagram([UInt8](data))
            }
            if error == nil {
                self?.receive(on: connection)
            }
        }
    }

    public func stop() {
        connections.forEach { $0.cancel() }
        connections.removeAll()
        listener?.cancel()
        listener = nil
    }
}
#endif
