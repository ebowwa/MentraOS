//
//  WebSocketManager.swift
//  AugmentOS_Manager
//
//  Created by Matthew Fosse on 3/5/25.
//

import Foundation
import Combine

enum WebSocketStatus {
  case disconnected
  case connecting
  case connected
  case error
}

class WebSocketManager: NSObject, URLSessionWebSocketDelegate {
  private var webSocket: URLSessionWebSocketTask?
  private var session: URLSession?
  private let statusSubject = PassthroughSubject<WebSocketStatus, Never>()
  private let messageSubject = PassthroughSubject<[String: Any], Never>()
  
  var status: AnyPublisher<WebSocketStatus, Never> {
    return statusSubject.eraseToAnyPublisher()
  }
  
  var messages: AnyPublisher<[String: Any], Never> {
    return messageSubject.eraseToAnyPublisher()
  }
  
  override init() {
    super.init()
    self.session = URLSession(configuration: .default, delegate: self, delegateQueue: OperationQueue())
  }
  
  func connect(url: URL, coreToken: String) {
    // Disconnect existing connection if any
    disconnect()
    
    // Update status to connecting
    statusSubject.send(.connecting)
    
    // Create new WebSocket task
    webSocket = session?.webSocketTask(with: url)
    webSocket?.resume()
    
    // Start receiving messages
    receiveMessage()
    
    // Wait a second before sending connection_init (similar to the Java code)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
      self.sendConnectionInit(coreToken: coreToken)
    }
  }
  
  func disconnect() {
    webSocket?.cancel(with: .normalClosure, reason: nil)
    webSocket = nil
    statusSubject.send(.disconnected)
  }
  
  func isConnected() -> Bool {
    return webSocket != nil && webSocket?.state == .running
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
    print("sending binary data over websocket : \(data.count)")
    guard isConnected() else {
      print("Cannot send binary data: WebSocket not connected")
      return
    }
    
    webSocket?.send(.data(data)) { error in
      if let error = error {
        print("Error sending binary data: \(error)")
      }
    }
  }
  
  private func sendConnectionInit(coreToken: String) {
    do {
      let initMsg: [String: Any] = [
        "type": "connection_init",
        "coreToken": coreToken
      ]
      
      let jsonData = try JSONSerialization.data(withJSONObject: initMsg)
      if let jsonString = String(data: jsonData, encoding: .utf8) {
        sendText(jsonString)
        print("Sent connection_init message")
      }
    } catch {
      print("Error building connection_init JSON: \(error)")
    }
  }
  
  private func receiveMessage() {
    webSocket?.receive { [weak self] result in
      guard let self = self else { return }
      
      switch result {
      case .success(let message):
        switch message {
        case .string(let text):
          if let data = text.data(using: .utf8),
             let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            self.handleIncomingMessage(json)
          }
        case .data(let data):
          if let text = String(data: data, encoding: .utf8),
             let json = try? JSONSerialization.jsonObject(with: text.data(using: .utf8)!) as? [String: Any] {
            self.handleIncomingMessage(json)
          }
        @unknown default:
          break
        }
        
        // Continue receiving messages
        self.receiveMessage()
        
      case .failure(let error):
        print("WebSocket receive error: \(error)")
        self.statusSubject.send(.error)
        
        // Try to reconnect after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
          if self.isConnected() {
            self.receiveMessage()
          }
        }
      }
    }
  }
  
  private func handleIncomingMessage(_ message: [String: Any]) {
    // Forward message to subscribers
    messageSubject.send(message)
  }
  
  // MARK: - URLSessionWebSocketDelegate
  
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    print("WebSocket connection established")
    statusSubject.send(.connected)
  }
  
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
    print("WebSocket connection closed with code: \(closeCode)")
    statusSubject.send(.disconnected)
  }
  
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error = error {
      print("WebSocket task completed with error: \(error)")
      statusSubject.send(.error)
    }
  }
  
  func cleanup() {
    disconnect()
  }
}
