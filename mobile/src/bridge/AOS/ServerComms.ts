// WebSocketManager.ts

export enum WebSocketStatus {
  Disconnected = "disconnected",
  Connecting = "connecting",
  Connected = "connected",
  Error = "error",
}

type MessageHandler = (message: Record<string, any>) => void
type StatusHandler = (status: WebSocketStatus) => void

export class WebSocketManager {
  private webSocket: WebSocket | null = null
  private statusHandlers: StatusHandler[] = []
  private messageHandlers: MessageHandler[] = []
  private coreToken: string | null = null
  private previousStatus: WebSocketStatus = WebSocketStatus.Disconnected

  // Subscribe to status changes
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler)
    // Return unsubscribe function
    return () => {
      const index = this.statusHandlers.indexOf(handler)
      if (index > -1) {
        this.statusHandlers.splice(index, 1)
      }
    }
  }

  // Subscribe to messages
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    // Return unsubscribe function
    return () => {
      const index = this.messageHandlers.indexOf(handler)
      if (index > -1) {
        this.messageHandlers.splice(index, 1)
      }
    }
  }

  // Only publish when value actually changes
  private updateStatus(newStatus: WebSocketStatus): void {
    if (newStatus !== this.previousStatus) {
      this.previousStatus = newStatus
      this.statusHandlers.forEach(handler => handler(newStatus))
    }
  }

  connect(url: string, coreToken: string): void {
    this.coreToken = coreToken

    // Disconnect existing connection if any
    if (this.webSocket) {
      this.webSocket.close()
      this.webSocket = null
    }

    // Update status to connecting
    this.updateStatus(WebSocketStatus.Connecting)

    // Create new WebSocket with Authorization header
    // Note: Browser WebSocket API doesn't support custom headers directly
    // You'll need to handle auth differently (e.g., via query params or after connection)
    this.webSocket = new WebSocket(url)

    // Set up event handlers
    this.webSocket.onopen = () => {
      console.log("WebSocket connection established")
      this.updateStatus(WebSocketStatus.Connected)
    }

    this.webSocket.onmessage = event => {
      this.handleMessage(event)
    }

    this.webSocket.onclose = event => {
      console.log(`WebSocket connection closed with code: ${event.code}`)
      this.updateStatus(WebSocketStatus.Disconnected)
    }

    this.webSocket.onerror = error => {
      console.error("WebSocket error:", error)
      this.updateStatus(WebSocketStatus.Error)
    }
  }

  disconnect(): void {
    if (this.webSocket) {
      this.webSocket.close()
      this.webSocket = null
    }
    this.updateStatus(WebSocketStatus.Disconnected)
  }

  isConnected(): boolean {
    return this.webSocket !== null && this.webSocket.readyState === WebSocket.OPEN
  }

  isActuallyConnected(): boolean {
    return this.previousStatus === WebSocketStatus.Connected
  }

  // Send JSON message
  sendText(text: string): void {
    if (!this.isConnected()) {
      console.error("Cannot send message: WebSocket not connected")
      return
    }

    this.webSocket!.send(text)
  }

  // Send binary data (for audio)
  sendBinary(data: ArrayBuffer | Blob): void {
    if (!this.isConnected()) {
      console.error("Cannot send binary data: WebSocket not connected")
      return
    }

    this.webSocket!.send(data)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      let message: Record<string, any>

      if (typeof event.data === "string") {
        message = JSON.parse(event.data)
      } else if (event.data instanceof Blob) {
        // Handle binary data if needed
        event.data.text().then(text => {
          try {
            message = JSON.parse(text)
            this.handleIncomingMessage(message)
          } catch (e) {
            console.error("Failed to parse binary message as JSON:", e)
          }
        })
        return
      } else {
        console.error("Unknown message type:", typeof event.data)
        return
      }

      this.handleIncomingMessage(message)
    } catch (error) {
      console.error("Failed to parse WebSocket message:", error)
    }
  }

  private handleIncomingMessage(message: Record<string, any>): void {
    // Forward message to subscribers
    this.messageHandlers.forEach(handler => handler(message))
  }

  cleanup(): void {
    this.disconnect()
  }
}

// ServerComms.ts

export interface ServerCommsCallback {
  onConnectionAck(): void
  onAppStateChange(apps: ThirdPartyCloudApp[]): void
  onConnectionError(error: string): void
  onAuthError(): void
  onMicrophoneStateChange(isEnabled: boolean): void
  onDisplayEvent(event: Record<string, any>): void
  onRequestSingle(dataType: string): void
  onStatusUpdate(status: Record<string, any>): void
  onAppStarted(packageName: string): void
  onAppStopped(packageName: string): void
  onJsonMessage(message: Record<string, any>): void
  onPhotoRequest(requestId: string, appId: string, webhookUrl: string): void
  onRtmpStreamStartRequest(message: Record<string, any>): void
  onRtmpStreamStop(): void
  onRtmpStreamKeepAlive(message: Record<string, any>): void
}

export interface ThirdPartyCloudApp {
  packageName: string
  name: string
  description: string
  webhookURL: string
  logoURL: string
  isRunning: boolean
}

export interface CalendarItem {
  title: string
  eventId: string
  dtStart: number
  dtEnd: number
  timeZone: string
}

// Simple queue implementation
class ArrayBlockingQueue<T> {
  private array: T[] = []
  private capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
  }

  offer(element: T): boolean {
    if (this.array.length < this.capacity) {
      this.array.push(element)
      return true
    } else if (this.array.length > 0) {
      // If queue is full, remove the oldest item
      this.array.shift()
      this.array.push(element)
      return true
    }
    return false
  }

  poll(): T | undefined {
    return this.array.shift()
  }
}

export class ServerComms {
  private static instance: ServerComms | null = null

  public readonly wsManager = new WebSocketManager()
  private speechRecCallback: ((message: Record<string, any>) => void) | null = null
  private serverCommsCallback: ServerCommsCallback | null = null
  private coreToken: string = ""
  public userid: string = ""
  private serverUrl: string = ""

  // Audio queue system
  private audioBuffer = new ArrayBlockingQueue<ArrayBuffer>(100)
  private audioSenderInterval: number | null = null
  private audioSenderRunning = false
  private unsubscribers: (() => void)[] = []

  private reconnecting = false
  private reconnectionAttempts = 0

  static getInstance(): ServerComms {
    if (!ServerComms.instance) {
      ServerComms.instance = new ServerComms()
    }
    return ServerComms.instance
  }

  private constructor() {
    // Subscribe to WebSocket messages
    const unsubscribeMessage = this.wsManager.onMessage(message => {
      this.handleIncomingMessage(message)
    })
    this.unsubscribers.push(unsubscribeMessage)

    // Subscribe to WebSocket status changes
    const unsubscribeStatus = this.wsManager.onStatus(status => {
      this.handleStatusChange(status)
    })
    this.unsubscribers.push(unsubscribeStatus)

    this.startAudioSenderThread()

    // Every hour send calendar events again
    setInterval(
      () => {
        console.log("Periodic calendar sync")
        this.sendCalendarEvents()
      },
      60 * 60 * 1000,
    ) // 1 hour

    // Deploy datetime coordinates to command center every 60 seconds
    setInterval(() => {
      console.log("Periodic datetime transmission")
      const isoDatetime = ServerComms.getCurrentIsoDatetime()
      this.sendUserDatetimeToBackend(isoDatetime)
    }, 60 * 1000) // 60 seconds
  }

  setAuthCredentials(userid: string, coreToken: string): void {
    this.coreToken = coreToken
    this.userid = userid
  }

  setServerUrl(url: string): void {
    this.serverUrl = url
    console.log(`ServerComms: setServerUrl: ${url}`)
    if (this.wsManager.isConnected()) {
      this.wsManager.disconnect()
      this.connectWebSocket()
    }
  }

  setServerCommsCallback(callback: ServerCommsCallback): void {
    this.serverCommsCallback = callback
  }

  setSpeechRecCallback(callback: (message: Record<string, any>) => void): void {
    this.speechRecCallback = callback
  }

  // Connection Management

  connectWebSocket(): void {
    const url = this.getServerUrl()
    if (!url) {
      console.error("Invalid server URL")
      return
    }
    this.wsManager.connect(url, this.coreToken)
  }

  isWebSocketConnected(): boolean {
    return this.wsManager.isActuallyConnected()
  }

  // Audio / VAD

  sendAudioChunk(audioData: ArrayBuffer): void {
    this.audioBuffer.offer(audioData)
  }

  private sendConnectionInit(coreToken: string): void {
    try {
      const initMsg = {
        type: "connection_init",
        coreToken: coreToken,
      }

      const jsonString = JSON.stringify(initMsg)
      this.wsManager.sendText(jsonString)
      console.log("ServerComms: Sent connection_init message")
    } catch (error) {
      console.error("ServerComms: Error building connection_init JSON:", error)
    }
  }

  sendVadStatus(isSpeaking: boolean): void {
    const vadMsg = {
      type: "VAD",
      status: isSpeaking,
    }

    const jsonString = JSON.stringify(vadMsg)
    this.wsManager.sendText(jsonString)
  }

  sendBatteryStatus(level: number, charging: boolean): void {
    const vadMsg = {
      type: "glasses_battery_update",
      level: level,
      charging: charging,
      timestamp: Date.now(),
    }

    const jsonString = JSON.stringify(vadMsg)
    this.wsManager.sendText(jsonString)
  }

  sendCalendarEvent(calendarItem: CalendarItem): void {
    if (!this.wsManager.isConnected()) {
      console.log("Cannot send calendar event: not connected.")
      return
    }

    try {
      const event = {
        type: "calendar_event",
        title: calendarItem.title,
        eventId: calendarItem.eventId,
        dtStart: calendarItem.dtStart,
        dtEnd: calendarItem.dtEnd,
        timeZone: calendarItem.timeZone,
        timestamp: Math.floor(Date.now() / 1000),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building calendar_event JSON:", error)
    }
  }

  public sendCalendarEvents(): void {
    // Implementation would depend on calendar manager
    // Placeholder for now
    if (!this.wsManager.isConnected()) return
    console.log("sendCalendarEvents - implementation needed")
  }

  sendLocationUpdate(lat: number, lng: number, accuracy?: number, correlationId?: string): void {
    try {
      const event: Record<string, any> = {
        type: "location_update",
        lat: lat,
        lng: lng,
        timestamp: Date.now(),
      }

      if (accuracy !== undefined) {
        event.accuracy = accuracy
      }

      if (correlationId) {
        event.correlationId = correlationId
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("ServerComms: Error building location_update JSON:", error)
    }
  }

  public sendLocationUpdates(): void {
    if (!this.wsManager.isConnected()) {
      console.log("Cannot send location updates: WebSocket not connected")
      return
    }
    // Implementation would depend on location manager
    console.log("sendLocationUpdates - implementation needed")
  }

  public sendGlassesConnectionState(modelName: string, status: string): void {
    try {
      const event = {
        type: "glasses_connection_state",
        modelName: modelName,
        status: status,
        timestamp: Date.now(),
      }
      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("ServerComms: Error building glasses_connection_state JSON:", error)
    }
  }

  updateAsrConfig(languages: Array<Record<string, any>>): void {
    if (!this.wsManager.isConnected()) {
      console.log("Cannot send ASR config: not connected.")
      return
    }

    try {
      const configMsg = {
        type: "config",
        streams: languages,
      }

      const jsonString = JSON.stringify(configMsg)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building config message:", error)
    }
  }

  sendCoreStatus(status: Record<string, any>): void {
    try {
      const event = {
        type: "core_status_update",
        status: {status: status},
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building core_status_update JSON:", error)
    }
  }

  // App Lifecycle

  startApp(packageName: string): void {
    try {
      const msg = {
        type: "start_app",
        packageName: packageName,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(msg)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building start_app JSON:", error)
    }
  }

  stopApp(packageName: string): void {
    try {
      const msg = {
        type: "stop_app",
        packageName: packageName,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(msg)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building stop_app JSON:", error)
    }
  }

  // Hardware Events

  sendButtonPress(buttonId: string, pressType: string): void {
    try {
      const event = {
        type: "button_press",
        buttonId: buttonId,
        pressType: pressType,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("ServerComms: Error building button_press JSON:", error)
    }
  }

  sendPhotoResponse(requestId: string, photoUrl: string): void {
    try {
      const event = {
        type: "photo_response",
        requestId: requestId,
        photoUrl: photoUrl,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building photo_response JSON:", error)
    }
  }

  sendVideoStreamResponse(appId: string, streamUrl: string): void {
    try {
      const event = {
        type: "video_stream_response",
        appId: appId,
        streamUrl: streamUrl,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error building video_stream_response JSON:", error)
    }
  }

  sendHeadPosition(isUp: boolean): void {
    try {
      const event = {
        type: "head_position",
        position: isUp ? "up" : "down",
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.error("Error sending head position:", error)
    }
  }

  // Message Handling

  private handleIncomingMessage(msg: Record<string, any>): void {
    const type = msg.type as string
    if (!type) return

    console.log(`Received message of type: ${type}`)

    switch (type) {
      case "connection_ack":
        this.startAudioSenderThread()
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onAppStateChange(this.parseAppList(msg))
          this.serverCommsCallback.onConnectionAck()
        }
        break

      case "app_state_change":
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onAppStateChange(this.parseAppList(msg))
        }
        break

      case "connection_error":
        const errorMsg = msg.message || "Unknown error"
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onConnectionError(errorMsg)
        }
        break

      case "auth_error":
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onAuthError()
        }
        break

      case "microphone_state_change":
        console.log("ServerComms: microphone_state_change:", msg)
        const isMicrophoneEnabled = msg.isMicrophoneEnabled ?? true
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onMicrophoneStateChange(isMicrophoneEnabled)
        }
        break

      case "display_event":
        if (msg.view && this.serverCommsCallback) {
          this.serverCommsCallback.onDisplayEvent(msg)
        }
        break

      case "audio_play_request":
        this.handleAudioPlayRequest(msg)
        break

      case "audio_stop_request":
        this.handleAudioStopRequest()
        break

      case "request_single":
        if (msg.data_type && this.serverCommsCallback) {
          this.serverCommsCallback.onRequestSingle(msg.data_type)
        }
        break

      case "interim":
      case "final":
        // Pass speech messages to speech recognition callback
        if (this.speechRecCallback) {
          this.speechRecCallback(msg)
        } else {
          console.log("ServerComms: Received speech message but speechRecCallback is null!")
        }
        break

      case "reconnect":
        console.log("ServerComms: Server is requesting a reconnect.")
        break

      case "settings_update":
        console.log("ServerComms: Received settings update from WebSocket")
        if (msg.status && this.serverCommsCallback) {
          this.serverCommsCallback.onStatusUpdate(msg.status)
        }
        break

      case "set_location_tier":
        console.log("DEBUG set_location_tier:", msg)
        // Implementation would depend on location manager
        break

      case "request_single_location":
        console.log("DEBUG request_single_location:", msg)
        // Implementation would depend on location manager
        break

      case "app_started":
        if (msg.packageName && this.serverCommsCallback) {
          console.log(`ServerComms: Received app_started message for package: ${msg.packageName}`)
          this.serverCommsCallback.onAppStarted(msg.packageName)
        }
        break

      case "app_stopped":
        if (msg.packageName && this.serverCommsCallback) {
          console.log(`ServerComms: Received app_stopped message for package: ${msg.packageName}`)
          this.serverCommsCallback.onAppStopped(msg.packageName)
        }
        break

      case "photo_request":
        const requestId = msg.requestId || ""
        const appId = msg.appId || ""
        const webhookUrl = msg.webhookUrl || ""
        console.log(`Received photo_request, requestId: ${requestId}, appId: ${appId}, webhookUrl: ${webhookUrl}`)
        if (requestId && appId && this.serverCommsCallback) {
          this.serverCommsCallback.onPhotoRequest(requestId, appId, webhookUrl)
        } else {
          console.log("Invalid photo request: missing requestId or appId")
        }
        break

      case "start_rtmp_stream":
        const rtmpUrl = msg.rtmpUrl || ""
        if (rtmpUrl && this.serverCommsCallback) {
          this.serverCommsCallback.onRtmpStreamStartRequest(msg)
        } else {
          console.log("Invalid RTMP stream request: missing rtmpUrl or callback")
        }
        break

      case "stop_rtmp_stream":
        console.log("Received STOP_RTMP_STREAM")
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onRtmpStreamStop()
        }
        break

      case "keep_rtmp_stream_alive":
        console.log("ServerComms: Received KEEP_RTMP_STREAM_ALIVE:", msg)
        if (this.serverCommsCallback) {
          this.serverCommsCallback.onRtmpStreamKeepAlive(msg)
        }
        break

      default:
        console.log(`ServerComms: Unknown message type: ${type} / full:`, msg)
    }
  }

  private handleAudioPlayRequest(msg: Record<string, any>): void {
    console.log("ServerComms: Handling audio play request:", msg)
    const requestId = msg.requestId
    if (!requestId) return

    console.log(`ServerComms: Handling audio play request for requestId: ${requestId}`)

    // Audio manager implementation would go here
    console.log("handleAudioPlayRequest - implementation needed")
  }

  private handleAudioStopRequest(): void {
    console.log("ServerComms: Handling audio stop request")
    // Audio manager implementation would go here
    console.log("handleAudioStopRequest - implementation needed")
  }

  private attemptReconnect(override = false): void {
    if (this.reconnecting && !override) return
    this.reconnecting = true

    this.connectWebSocket()

    // If after some time we're still not connected, run this function again
    setTimeout(() => {
      if (this.wsManager.isActuallyConnected()) {
        this.reconnectionAttempts = 0
        this.reconnecting = false
        return
      }
      this.reconnectionAttempts++
      this.attemptReconnect(true)
    }, 10000)
  }

  private handleStatusChange(status: WebSocketStatus): void {
    console.log(`handleStatusChange: ${status}`)

    if (status === WebSocketStatus.Disconnected || status === WebSocketStatus.Error) {
      this.stopAudioSenderThread()
      this.attemptReconnect()
    }

    if (status === WebSocketStatus.Connected) {
      // Wait a second before sending connection_init (similar to the Swift code)
      setTimeout(() => {
        this.sendConnectionInit(this.coreToken)
        this.sendCalendarEvents()
        this.sendLocationUpdates()
      }, 3000)
    }
  }

  // Audio Queue Sender Thread

  private startAudioSenderThread(): void {
    if (this.audioSenderInterval !== null) return

    this.audioSenderRunning = true

    // Use setInterval to simulate thread behavior
    this.audioSenderInterval = window.setInterval(() => {
      if (!this.audioSenderRunning) {
        this.stopAudioSenderThread()
        return
      }

      const chunk = this.audioBuffer.poll()
      if (chunk) {
        if (this.wsManager.isConnected()) {
          this.wsManager.sendBinary(chunk)
        } else {
          // Re-enqueue the chunk if not connected
          this.audioBuffer.offer(chunk)
        }
      }
    }, 10) // 10ms interval
  }

  private stopAudioSenderThread(): void {
    console.log("stopping audio sender thread")
    this.audioSenderRunning = false
    if (this.audioSenderInterval !== null) {
      clearInterval(this.audioSenderInterval)
      this.audioSenderInterval = null
    }
  }

  // Helper methods

  async sendUserDatetimeToBackend(isoDatetime: string): Promise<void> {
    const url = `${this.getServerUrlForRest()}/api/user-data/set-datetime`

    const body = {
      coreToken: this.coreToken,
      datetime: isoDatetime,
    }

    try {
      console.log(`ServerComms: Sending datetime to: ${url}`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const responseText = await response.text()
        console.log(`ServerComms: Datetime transmission successful: ${responseText}`)
      } else {
        console.log(`ServerComms: Datetime transmission failed. Response code: ${response.status}`)
        const errorText = await response.text()
        console.log(`ServerComms: Error response: ${errorText}`)
      }
    } catch (error) {
      console.error("ServerComms: Exception during datetime transmission:", error)
    }
  }

  private getServerUrlForRest(): string {
    if (this.serverUrl) {
      // Extract base URL from WebSocket URL
      const url = new URL(this.serverUrl)
      const protocol = url.protocol === "wss:" ? "https:" : "http:"
      return `${protocol}//${url.host}`
    }

    // Fallback to environment configuration
    // You'll need to implement your own config system
    const host = process.env.MENTRAOS_HOST || "localhost"
    const port = process.env.MENTRAOS_PORT || "3000"
    const secure = process.env.MENTRAOS_SECURE === "true"
    return `${secure ? "https" : "http"}://${host}:${port}`
  }

  private getServerUrl(): string {
    if (this.serverUrl) {
      const url = new URL(this.serverUrl)
      const protocol = url.protocol === "https:" ? "wss:" : "ws:"
      return `${protocol}//${url.host}/glasses-ws`
    }

    // Fallback to environment configuration
    const host = process.env.MENTRAOS_HOST || "localhost"
    const port = process.env.MENTRAOS_PORT || "3000"
    const secure = process.env.MENTRAOS_SECURE === "true"
    const wsUrl = `${secure ? "wss" : "ws"}://${host}:${port}/glasses-ws`
    console.log(`ServerComms: getServerUrl(): ${wsUrl}`)
    return wsUrl
  }

  private parseAppList(msg: Record<string, any>): ThirdPartyCloudApp[] {
    let installedApps: Array<Record<string, any>> | undefined
    let activeAppPackageNames: string[] | undefined

    // Try to grab installedApps at the top level
    installedApps = msg.installedApps as Array<Record<string, any>>

    // If not found, look for "userSession.installedApps"
    if (!installedApps && msg.userSession) {
      installedApps = msg.userSession.installedApps as Array<Record<string, any>>
    }

    // Similarly, try to find activeAppPackageNames at top level or under userSession
    activeAppPackageNames = msg.activeAppPackageNames as string[]
    if (!activeAppPackageNames && msg.userSession) {
      activeAppPackageNames = msg.userSession.activeAppPackageNames as string[]
    }

    // Convert activeAppPackageNames into a Set for easy lookup
    const runningPackageNames = new Set<string>()
    if (activeAppPackageNames) {
      for (const packageName of activeAppPackageNames) {
        if (packageName) {
          runningPackageNames.add(packageName)
        }
      }
    }

    // Build a list of ThirdPartyCloudApp objects from installedApps
    const appList: ThirdPartyCloudApp[] = []
    if (installedApps) {
      for (const appJson of installedApps) {
        const packageName = appJson.packageName || "unknown.package"
        const isRunning = runningPackageNames.has(packageName)

        const app: ThirdPartyCloudApp = {
          packageName: packageName,
          name: appJson.name || "Unknown App",
          description: appJson.description || "No description available.",
          webhookURL: appJson.webhookURL || "",
          logoURL: appJson.logoURL || "",
          isRunning: isRunning,
        }
        appList.push(app)
      }
    }

    return appList
  }

  static getCurrentIsoDatetime(): string {
    const date = new Date()
    return date.toISOString()
  }

  cleanup(): void {
    this.stopAudioSenderThread()
    this.wsManager.cleanup()

    // Unsubscribe all handlers
    this.unsubscribers.forEach(unsub => unsub())
    this.unsubscribers = []
  }
}
