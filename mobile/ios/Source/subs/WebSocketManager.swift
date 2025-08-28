//
//  WebSocketManager.swift
//  MentraOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Combine
import Foundation

enum WebSocketStatus {
    case disconnected
    case connecting
    case connected
    case error
}

class WebSocketManager: NSObject, URLSessionWebSocketDelegate {
    static var shared = WebSocketManager()

    private var webSocket: URLSessionWebSocketTask?
    private var session: URLSession?
    private let statusSubject = PassthroughSubject<WebSocketStatus, Never>()
    private let messageSubject = PassthroughSubject<[String: Any], Never>()
    private var coreToken: String?
    private var previousStatus: WebSocketStatus = .disconnected

    var status: AnyPublisher<WebSocketStatus, Never> {
        return statusSubject.eraseToAnyPublisher()
    }

    var messages: AnyPublisher<[String: Any], Never> {
        return messageSubject.eraseToAnyPublisher()
    }

    // Only publish when value actually changes
    private func updateStatus(_ newStatus: WebSocketStatus) {
        if newStatus != previousStatus {
            previousStatus = newStatus
            statusSubject.send(newStatus)
        }
    }

    override private init() {
        super.init()
        session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
    }

    func connect(url: URL, coreToken: String) {
        self.coreToken = coreToken

        // Disconnect existing connection if any, but don't update the disconnect status since we're connecting and don't want to trigger the reconnect handler:
//    disconnect()
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil

        // Update status to connecting
        updateStatus(.connecting)

        // Create new WebSocket task with Authorization header
        var request = URLRequest(url: url)
        request.addValue("Bearer \(coreToken)", forHTTPHeaderField: "Authorization")
        webSocket = session?.webSocketTask(with: request)
        webSocket?.resume()

        // Start receiving messages
        receiveMessage()
    }

    func disconnect() {
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        updateStatus(.disconnected)
    }

    func isConnected() -> Bool {
        return webSocket != nil && webSocket?.state == .running
    }

    func isActuallyConnected() -> Bool {
        return previousStatus == .connected
    }

    // Send JSON message
    func sendText(_ text: String) {
        guard isConnected() else {
            print("Cannot send message: WebSocket not connected")
            return
        }

        webSocket?.send(.string(text)) { error in
            if let error = error {
                print("Error sending text message: \(error)")
            }
        }
    }

    // Send binary data (for audio)
    func sendBinary(_ data: Data) {
        guard isConnected() else {
            print("Cannot send binary data: WebSocket not connected")
            return
        }

//    print("sending binary data... \(data.count) bytes")

        webSocket?.send(.data(data)) { error in
            if let error = error {
                print("Error sending binary data: \(error)")
            }
        }
    }

    private func receiveMessage() {
        webSocket?.receive { [weak self] result in
            guard let self = self else { return }

            switch result {
            case let .success(message):
                switch message {
                case let .string(text):
                    if let data = text.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                    {
                        self.handleIncomingMessage(json)
                    }
                case let .data(data):
                    if let text = String(data: data, encoding: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: text.data(using: .utf8)!) as? [String: Any]
                    {
                        self.handleIncomingMessage(json)
                    }
                @unknown default:
                    break
                }

                // Continue receiving messages
                self.receiveMessage()

            case let .failure(error):
                print("WebSocket receive error: \(error)")
                updateStatus(.error)
            }
        }
    }

    private func handleIncomingMessage(_ message: [String: Any]) {
        // Forward message to subscribers
        messageSubject.send(message)
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(_: URLSession, webSocketTask _: URLSessionWebSocketTask, didOpenWithProtocol _: String?) {
        print("WebSocket connection established")
        updateStatus(.connected)
    }

    func urlSession(_: URLSession, webSocketTask _: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason _: Data?) {
        print("WebSocket connection closed with code: \(closeCode)")
        updateStatus(.disconnected)
    }

    func urlSession(_: URLSession, task _: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            print("WebSocket task completed with error: \(error)")
            updateStatus(.error)
        }
    }

    func cleanup() {
        disconnect()
    }
}
