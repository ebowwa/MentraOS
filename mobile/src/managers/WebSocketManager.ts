import {EventEmitter} from "events"
import {useConnectionStore} from "@/stores/connection"

export enum WebSocketStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  ERROR = "error",
}

class WebSocketManager extends EventEmitter {
  private static instance: WebSocketManager | null = null
  private webSocket: WebSocket | null = null
  private previousStatus: WebSocketStatus = WebSocketStatus.DISCONNECTED
  private reconnectTimeout: NodeJS.Timeout | null = null
  private url: string | null = null
  private coreToken: string | null = null
  private reconnectInterval: any = null
  private manuallyDisconnected: boolean = false

  private constructor() {
    super()
  }

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager()
    }
    return WebSocketManager.instance
  }

  // Only emit when status actually changes
  private updateStatus(newStatus: WebSocketStatus) {
    if (newStatus !== this.previousStatus) {
      this.previousStatus = newStatus

      // Update the connection store
      const store = useConnectionStore.getState()
      store.setStatus(newStatus)
    }
  }

  connect(url: string, coreToken: string) {
    console.log(`WSM: connect: ${url}, ${coreToken}`)
    this.manuallyDisconnected = false
    this.url = url
    this.coreToken = coreToken

    // Disconnect existing connection if any
    if (this.webSocket) {
      this.webSocket.onclose = null
      this.webSocket.onerror = null
      this.webSocket.onmessage = null
      this.webSocket.onopen = null
      this.webSocket.close()
      this.webSocket = null
    }

    // Update status to connecting and set URL in store
    this.updateStatus(WebSocketStatus.CONNECTING)
    const store = useConnectionStore.getState()
    store.setUrl(url)

    // Create new WebSocket with authorization header
    const wsUrl = new URL(url)
    wsUrl.searchParams.set("token", coreToken)
    wsUrl.searchParams.set("livekit", "true")

    this.webSocket = new WebSocket(wsUrl.toString())

    // Set up event handlers
    this.webSocket.onopen = () => {
      console.log("WSM: WebSocket connection established")
      this.updateStatus(WebSocketStatus.CONNECTED)
      store.setConnected()
    }

    this.webSocket.onmessage = event => {
      this.handleIncomingMessage(event.data)
    }

    this.webSocket.onerror = error => {
      console.error("WSM: WebSocket error:", error)
      this.updateStatus(WebSocketStatus.ERROR)
      store.setError(error?.toString() || "WebSocket error")
      this.startReconnectInterval()
    }

    this.webSocket.onclose = event => {
      console.error("WSM: Connection closed with code:", event.code)
      this.updateStatus(WebSocketStatus.DISCONNECTED)
      store.setDisconnected()
      this.startReconnectInterval()
    }
  }

  startReconnectInterval() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval)
      this.reconnectInterval = null
    }

    // Don't start reconnect if manually disconnected
    if (this.manuallyDisconnected) return

    this.reconnectInterval = setInterval(() => {
      console.error("WSM: Attempting reconnect")
      const store = useConnectionStore.getState()
      if (store.status === WebSocketStatus.DISCONNECTED) {
        this.handleReconnect()
      }
      if (store.status === WebSocketStatus.CONNECTED) {
        clearInterval(this.reconnectInterval)
      }
    }, 5000)
  }

  handleReconnect() {
    console.log("WSM: Attempting reconnect")
    this.connect(this.url!, this.coreToken!)
  }

  disconnect() {
    this.manuallyDisconnected = true

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.webSocket) {
      this.webSocket.close()
      this.webSocket = null
    }

    this.updateStatus(WebSocketStatus.DISCONNECTED)
    const store = useConnectionStore.getState()
    store.setDisconnected()
  }

  isConnected(): boolean {
    // return this.webSocket !== null && this.webSocket.readyState === WebSocket.OPEN
    return this.previousStatus === WebSocketStatus.CONNECTED
  }

  // Send JSON message
  sendText(text: string) {
    if (!this.isConnected()) {
      console.log("WSM: Cannot send message: WebSocket not connected")
      return
    }

    try {
      this.webSocket?.send(text)
    } catch (error) {
      console.error("WSM: Error sending text message:", error)
    }
  }

  // Send binary data (for audio)
  sendBinary(data: ArrayBuffer | Uint8Array) {
    if (!this.isConnected()) {
      console.log("WSM: Cannot send binary data: WebSocket not connected")
      return
    }

    try {
      this.webSocket?.send(data)
    } catch (error) {
      console.error("WSM: Error sending binary data:", error)
    }
  }

  private handleIncomingMessage(data: string | ArrayBuffer) {
    try {
      let message: any

      if (typeof data === "string") {
        message = JSON.parse(data)
      } else {
        // Handle binary data - convert to string first
        const decoder = new TextDecoder()
        const text = decoder.decode(data)
        message = JSON.parse(text)
      }

      // Forward message to listeners
      this.emit("message", message)
    } catch (error) {
      console.error("WSM: Failed to parse WebSocket message:", error)
    }
  }

  cleanup() {
    this.disconnect()
    this.removeAllListeners()
    WebSocketManager.instance = null
    const store = useConnectionStore.getState()
    store.reset()
  }
}

const wsManager = WebSocketManager.getInstance()
export default wsManager
