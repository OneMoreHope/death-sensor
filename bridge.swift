import Foundation
import CoreMotion
import Network

final class MotionState: @unchecked Sendable {
    static let shared = MotionState()
    let lock = NSLock()
    var status: String = "waiting_for_airpods"
    var available: Bool = false
    var active: Bool = false
    var roll: Double = 0.0
    var pitch: Double = 0.0
    var yaw: Double = 0.0
    var timestamp: Double = 0.0
    var errorMessage: String = ""

    func toJSON() -> String {
        lock.lock()
        defer { lock.unlock() }
        return String(
            format: "{\"status\":\"%@\",\"available\":%@,\"active\":%@,\"roll\":%.2f,\"pitch\":%.2f,\"yaw\":%.2f,\"ts\":%.3f,\"error\":\"%@\"}\n",
            status,
            available ? "true" : "false",
            active ? "true" : "false",
            roll,
            pitch,
            yaw,
            timestamp,
            errorMessage
        )
    }
}

class HeadphoneTracker: NSObject, CMHeadphoneMotionManagerDelegate {
    let manager = CMHeadphoneMotionManager()
    let outFile = "/tmp/airpods_motion.json"

    override init() {
        super.init()
        manager.delegate = self
        startTracking()
    }

    func startTracking() {
        let s = MotionState.shared
        s.lock.lock()
        s.available = manager.isDeviceMotionAvailable
        s.status = manager.isDeviceMotionAvailable ? "starting" : "unavailable"
        s.lock.unlock()
        writeToFile()

        guard manager.isDeviceMotionAvailable else { return }

        manager.startDeviceMotionUpdates(to: OperationQueue.main) { [weak self] motion, error in
            guard let self = self else { return }
            let state = MotionState.shared
            state.lock.lock()
            if let error = error {
                state.status = "error"
                state.active = false
                state.errorMessage = error.localizedDescription.replacingOccurrences(of: "\"", with: "'")
            } else if let m = motion {
                state.status = "connected"
                state.active = true
                state.available = true
                state.roll = m.attitude.roll * (180.0 / .pi)
                state.pitch = m.attitude.pitch * (180.0 / .pi)
                state.yaw = m.attitude.yaw * (180.0 / .pi)
                state.timestamp = Date().timeIntervalSince1970
                state.errorMessage = ""
            }
            state.lock.unlock()
            self.writeToFile()
        }
    }

    func headphoneMotionManagerDidConnect(_ manager: CMHeadphoneMotionManager) {
        let state = MotionState.shared
        state.lock.lock()
        state.status = "connected"
        state.available = true
        state.lock.unlock()
        writeToFile()
    }

    func headphoneMotionManagerDidDisconnect(_ manager: CMHeadphoneMotionManager) {
        let state = MotionState.shared
        state.lock.lock()
        state.status = "disconnected"
        state.active = false
        state.lock.unlock()
        writeToFile()
    }

    func writeToFile() {
        let json = MotionState.shared.toJSON()
        try? json.write(toFile: outFile, atomically: true, encoding: .utf8)
    }
}

// Minimal HTTP Server on 127.0.0.1:8765 using Network Framework
class LocalHTTPServer {
    var listener: NWListener?

    func start(port: UInt16 = 8765) {
        do {
            let params = NWParameters.tcp
            listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
            listener?.newConnectionHandler = { connection in
                connection.start(queue: .global())
                self.handleConnection(connection)
            }
            listener?.start(queue: .global())
        } catch {
            print("Failed to start HTTP listener: \(error)")
        }
    }

    private func handleConnection(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
            let body = MotionState.shared.toJSON()
            let response = """
            HTTP/1.1 200 OK\r
            Content-Type: application/json\r
            Access-Control-Allow-Origin: *\r
            Access-Control-Allow-Methods: GET, OPTIONS\r
            Cache-Control: no-cache, no-store\r
            Content-Length: \(body.utf8.count)\r
            Connection: close\r
            \r
            \(body)
            """
            connection.send(content: response.data(using: .utf8), completion: .contentProcessed { _ in
                connection.cancel()
            })
        }
    }
}

let tracker = HeadphoneTracker()
let server = LocalHTTPServer()
server.start(port: 8765)

// Keep daemon running continuously
RunLoop.main.run()
