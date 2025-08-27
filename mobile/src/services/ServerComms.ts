import Config from "react-native-config"
import WebSocketManager, {WebSocketStatus} from "./WebSocketManager"
import coreCommunicator from "@/bridge/CoreCommunicator"

// Type definitions
interface ThirdPartyCloudApp {
  packageName: string
  name: string
  description: string
  webhookURL: string
  logoURL: string
  isRunning: boolean
}

interface ArrayBlockingQueueItem<T> {
  data: T
  timestamp: number
}

class ArrayBlockingQueue<T> {
  private queue: ArrayBlockingQueueItem<T>[] = []
  private capacity: number

  constructor(capacity: number) {
    this.capacity = capacity
  }

  offer(element: T): boolean {
    if (this.queue.length >= this.capacity) {
      // Remove oldest item if queue is full
      this.queue.shift()
    }
    this.queue.push({data: element, timestamp: Date.now()})
    return true
  }

  poll(): T | null {
    const item = this.queue.shift()
    return item ? item.data : null
  }

  take(): T | null {
    return this.poll()
  }

  size(): number {
    return this.queue.length
  }
}

class ServerComms {
  private static instance: ServerComms | null = null

  private wsManager = WebSocketManager.getInstance()
  private speechRecCallback: ((data: any) => void) | null = null
  private coreToken: string = ""
  public userid: string = ""
  private serverUrl: string = ""

  private reconnecting = false
  private reconnectionAttempts = 0

  // Timers
  private calendarSyncTimer: NodeJS.Timeout | null = null
  private datetimeTimer: NodeJS.Timeout | null = null

  private constructor() {
    // Subscribe to WebSocket messages
    this.wsManager.on("message", message => {
      this.handle_incoming_message(message)
    })

    // Subscribe to WebSocket status changes
    this.wsManager.on("statusChange", status => {
      this.handle_status_change(status)
    })

    this.start_audio_sender_thread()
    this.setup_periodic_tasks()
    this.setup_callbacks()
  }

  public static getInstance(): ServerComms {
    if (!ServerComms.instance) {
      ServerComms.instance = new ServerComms()
    }
    return ServerComms.instance
  }

  private setup_periodic_tasks() {
    // Calendar sync every hour
    this.calendarSyncTimer = setInterval(
      () => {
        console.log("Periodic calendar sync")
        this.send_calendar_events()
      },
      60 * 60 * 1000,
    ) // 1 hour

    // Datetime transmission every 60 seconds
    this.datetimeTimer = setInterval(() => {
      console.log("Periodic datetime transmission")
      const isoDatetime = ServerComms.get_current_iso_datetime()
      this.send_user_datetime_to_backend(isoDatetime)
    }, 60 * 1000) // 60 seconds
  }

  private setup_callbacks() {
    // Calendar and location updates will be triggered through native commands
    // No need for event listeners here - native side will call methods directly
  }

  set_auth_credentials(userid: string, coreToken: string) {
    this.coreToken = coreToken
    this.userid = userid
    // Store core token in storage if needed
    // Note: React Native doesn't have UserDefaults, you might want to use AsyncStorage
  }

  set_server_url(url: string) {
    this.serverUrl = url
    console.log(`ServerComms: setServerUrl: ${url}`)
    if (this.wsManager.isConnected()) {
      this.wsManager.disconnect()
      this.connect_websocket()
    }
  }

  set_speech_rec_callback(callback: (data: any) => void) {
    this.speechRecCallback = callback
  }

  // Connection Management
  connect_websocket() {
    const url = this.get_server_url()
    if (!url) {
      console.log("Invalid server URL")
      return
    }
    this.wsManager.connect(url, this.coreToken)
  }

  is_websocket_connected(): boolean {
    return this.wsManager.isActuallyConnected()
  }

  // Audio / VAD
  send_audio_chunk(audioData: ArrayBuffer | Uint8Array) {
    this.audioBuffer.offer(audioData)
  }

  private send_connection_init(coreToken: string) {
    try {
      const initMsg = {
        type: "connection_init",
        coreToken: coreToken,
      }

      const jsonString = JSON.stringify(initMsg)
      this.wsManager.sendText(jsonString)
      console.log("ServerComms: Sent connection_init message")
    } catch (error) {
      console.log(`ServerComms: Error building connection_init JSON: ${error}`)
    }
  }

  send_vad_status(isSpeaking: boolean) {
    const vadMsg = {
      type: "VAD",
      status: isSpeaking,
    }

    const jsonString = JSON.stringify(vadMsg)
    this.wsManager.sendText(jsonString)
  }

  send_battery_status(level: number, charging: boolean) {
    const msg = {
      type: "glasses_battery_update",
      level: level,
      charging: charging,
      timestamp: Date.now(),
    }

    const jsonString = JSON.stringify(msg)
    this.wsManager.sendText(jsonString)
  }

  send_calendar_event(calendarItem: any) {
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
      console.log(`Error building calendar_event JSON: ${error}`)
    }
  }

  async send_calendar_events() {
    if (!this.wsManager.isConnected()) return

    // Request calendar events from native side
    // Native side will handle fetching and sending events
    await coreCommunicator.sendCommand("fetch_calendar_events")
  }

  send_location_update(lat: number, lng: number, accuracy?: number, correlationId?: string) {
    try {
      const event: any = {
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
      console.log(`ServerComms: Error building location_update JSON: ${error}`)
    }
  }

  send_location_updates() {
    if (!this.wsManager.isConnected()) {
      console.log("Cannot send location updates: WebSocket not connected")
      return
    }

    // Request location from native side
    coreCommunicator.sendCommand("request_location_update")
  }

  send_glasses_connection_state(modelName: string, status: string) {
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
      console.log(`ServerComms: Error building glasses_connection_state JSON: ${error}`)
    }
  }

  update_asr_config(languages: any[]) {
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
      console.log(`Error building config message: ${error}`)
    }
  }

  send_core_status(status: any) {
    try {
      const event = {
        type: "core_status_update",
        status: {status: status},
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.log(`Error building core_status_update JSON: ${error}`)
    }
  }

  send_audio_play_response(requestId: string, success: boolean, error?: string, duration?: number) {
    console.log(
      `ServerComms: Sending audio play response - requestId: ${requestId}, success: ${success}, error: ${error || "none"}`,
    )

    const message: any = {
      type: "audio_play_response",
      requestId: requestId,
      success: success,
    }

    if (error) message.error = error
    if (duration !== undefined) message.duration = duration

    try {
      const jsonString = JSON.stringify(message)
      this.wsManager.sendText(jsonString)
      console.log("ServerComms: Sent audio play response to server")
    } catch (err) {
      console.log(`ServerComms: Failed to serialize audio play response: ${err}`)
    }
  }

  // App Lifecycle
  start_app(packageName: string) {
    try {
      const msg = {
        type: "start_app",
        packageName: packageName,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(msg)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.log(`Error building start_app JSON: ${error}`)
    }
  }

  stop_app(packageName: string) {
    try {
      const msg = {
        type: "stop_app",
        packageName: packageName,
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(msg)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.log(`Error building stop_app JSON: ${error}`)
    }
  }

  // Hardware Events
  send_button_press(buttonId: string, pressType: string) {
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
      console.log(`ServerComms: Error building button_press JSON: ${error}`)
    }
  }

  send_photo_response(requestId: string, photoUrl: string) {
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
      console.log(`Error building photo_response JSON: ${error}`)
    }
  }

  send_video_stream_response(appId: string, streamUrl: string) {
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
      console.log(`Error building video_stream_response JSON: ${error}`)
    }
  }

  send_head_position(isUp: boolean) {
    try {
      const event = {
        type: "head_position",
        position: isUp ? "up" : "down",
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.wsManager.sendText(jsonString)
    } catch (error) {
      console.log(`Error sending head position: ${error}`)
    }
  }

  // Message Handling
  private handle_incoming_message(msg: any) {
    const type = msg.type
    if (!type) return

    switch (type) {
      case "connection_ack":
        this.start_audio_sender_thread()
        // Send app state to native side
        coreCommunicator.sendCommand("update_app_state", {
          apps: this.parse_app_list(msg),
        })
        coreCommunicator.sendCommand("connection_ack")
        break

      case "app_state_change":
        coreCommunicator.sendCommand("update_app_state", {
          apps: this.parse_app_list(msg),
        })
        break

      case "connection_error":
        const errorMsg = msg.message || "Unknown error"
        coreCommunicator.sendCommand("connection_error", {
          message: errorMsg,
        })
        break

      case "auth_error":
        coreCommunicator.sendCommand("auth_error")
        break

      case "microphone_state_change":
        const bypassVad = msg.bypassVad || false
        const requiredDataStrings = msg.requiredData || []
        console.log(`ServerComms: requiredData = ${requiredDataStrings}, bypassVad = ${bypassVad}`)
        coreCommunicator.sendCommand("microphone_state_change", {
          requiredData: requiredDataStrings,
          bypassVad,
        })
        break

      case "display_event":
        if (msg.view) {
          coreCommunicator.sendCommand("display_event", msg)
        }
        break

      case "audio_play_request":
        this.handle_audio_play_request(msg)
        break

      case "audio_stop_request":
        this.handle_audio_stop_request()
        break

      case "request_single":
        if (msg.data_type) {
          coreCommunicator.sendCommand("request_single", {
            data_type: msg.data_type,
          })
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
        const status = msg.status
        if (status) {
          coreCommunicator.sendCommand("status_update", {status})
        }
        break

      case "set_location_tier":
        console.log("DEBUG set_location_tier:", msg)
        if (msg.tier) {
          coreCommunicator.sendCommand("set_location_tier", {tier: msg.tier})
        }
        break

      case "request_single_location":
        console.log("DEBUG request_single_location:", msg)
        if (msg.accuracy && msg.correlationId) {
          coreCommunicator.sendCommand("request_single_location", {
            accuracy: msg.accuracy,
            correlationId: msg.correlationId,
          })
        }
        break

      case "app_started":
        if (msg.packageName) {
          console.log(`ServerComms: Received app_started message for package: ${msg.packageName}`)
          coreCommunicator.sendCommand("app_started", {
            packageName: msg.packageName,
          })
        }
        break

      case "app_stopped":
        if (msg.packageName) {
          console.log(`ServerComms: Received app_stopped message for package: ${msg.packageName}`)
          coreCommunicator.sendCommand("app_stopped", {
            packageName: msg.packageName,
          })
        }
        break

      case "photo_request":
        const requestId = msg.requestId || ""
        const appId = msg.appId || ""
        const webhookUrl = msg.webhookUrl || ""
        const size = msg.size || "medium"
        console.log(
          `Received photo_request, requestId: ${requestId}, appId: ${appId}, webhookUrl: ${webhookUrl}, size: ${size}`,
        )
        if (requestId && appId) {
          coreCommunicator.sendCommand("photo_request", {
            requestId,
            appId,
            webhookUrl,
            size,
          })
        } else {
          console.log("Invalid photo request: missing requestId or appId")
        }
        break

      case "start_rtmp_stream":
        const rtmpUrl = msg.rtmpUrl || ""
        if (rtmpUrl) {
          coreCommunicator.sendCommand("start_rtmp_stream", msg)
        } else {
          console.log("Invalid RTMP stream request: missing rtmpUrl")
        }
        break

      case "stop_rtmp_stream":
        console.log("Received STOP_RTMP_STREAM")
        coreCommunicator.sendCommand("stop_rtmp_stream")
        break

      case "keep_rtmp_stream_alive":
        console.log(`ServerComms: Received KEEP_RTMP_STREAM_ALIVE: ${JSON.stringify(msg)}`)
        coreCommunicator.sendCommand("keep_rtmp_stream_alive", msg)
        break

      case "start_buffer_recording":
        console.log("ServerComms: Received START_BUFFER_RECORDING")
        coreCommunicator.sendCommand("start_buffer_recording")
        break

      case "stop_buffer_recording":
        console.log("ServerComms: Received STOP_BUFFER_RECORDING")
        coreCommunicator.sendCommand("stop_buffer_recording")
        break

      case "save_buffer_video":
        console.log(`ServerComms: Received SAVE_BUFFER_VIDEO: ${JSON.stringify(msg)}`)
        const bufferRequestId = msg.requestId || `buffer_${Date.now()}`
        const durationSeconds = msg.durationSeconds || 30
        coreCommunicator.sendCommand("save_buffer_video", {
          requestId: bufferRequestId,
          durationSeconds,
        })
        break

      case "start_video_recording":
        console.log(`ServerComms: Received START_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
        const videoRequestId = msg.requestId || `video_${Date.now()}`
        const save = msg.save !== false
        coreCommunicator.sendCommand("start_video_recording", {
          requestId: videoRequestId,
          save,
        })
        break

      case "stop_video_recording":
        console.log(`ServerComms: Received STOP_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
        const stopRequestId = msg.requestId || ""
        coreCommunicator.sendCommand("stop_video_recording", {
          requestId: stopRequestId,
        })
        break

      default:
        console.log(`ServerComms: Unknown message type: ${type} / full: ${JSON.stringify(msg)}`)
    }
  }

  private handle_audio_play_request(msg: any) {
    console.log(`ServerComms: Handling audio play request: ${JSON.stringify(msg)}`)
    const requestId = msg.requestId
    if (!requestId) return

    console.log(`ServerComms: Handling audio play request for requestId: ${requestId}`)

    const audioUrl = msg.audioUrl || ""
    const volume = msg.volume || 1.0
    const stopOtherAudio = msg.stopOtherAudio !== false

    // Forward to native audio handling through CoreCommunicator
    coreCommunicator.sendCommand("audio_play_request", {
      requestId,
      audioUrl,
      volume,
      stopOtherAudio,
    })
  }

  private handle_audio_stop_request() {
    console.log("ServerComms: Handling audio stop request")
    // Forward to native audio handling
    coreCommunicator.sendCommand("audio_stop_request")
  }

  private attempt_reconnect(override = false) {
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

  private handle_status_change(status: WebSocketStatus) {
    console.log(`handleStatusChange: ${status}`)

    if (status === WebSocketStatus.DISCONNECTED || status === WebSocketStatus.ERROR) {
      this.stop_audio_sender_thread()
      this.attempt_reconnect()
    }

    if (status === WebSocketStatus.CONNECTED) {
      // Wait a bit before sending connection_init
      setTimeout(() => {
        this.send_connection_init(this.coreToken)
        this.send_calendar_events()
        this.send_location_updates()
      }, 3000)
    }
  }

  // Helper methods
  async send_user_datetime_to_backend(isoDatetime: string) {
    const url = `${this.get_server_url_for_rest()}/api/user-data/set-datetime`

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
      console.log(`ServerComms: Exception during datetime transmission: ${error}`)
    }
  }

  private get_server_url_for_rest(): string {
    if (this.serverUrl) {
      // Extract base URL from WebSocket URL
      const url = new URL(this.serverUrl)
      const secure = url.protocol === "https:"
      return `${secure ? "https" : "http"}://${url.hostname}:${url.port || (secure ? 443 : 80)}`
    }

    // Fallback to environment configuration
    const host = Config.MENTRAOS_HOST
    const port = Config.MENTRAOS_PORT
    const secure = Config.MENTRAOS_SECURE === "true"
    return `${secure ? "https" : "http"}://${host}:${port}`
  }

  private get_server_url(): string {
    if (this.serverUrl) {
      const url = new URL(this.serverUrl)
      const secure = url.protocol === "https:"
      const wsUrl = `${secure ? "wss" : "ws"}://${url.hostname}:${url.port || (secure ? 443 : 80)}/glasses-ws`
      return wsUrl
    }

    const host = Config.MENTRAOS_HOST
    const port = Config.MENTRAOS_PORT
    const secure = Config.MENTRAOS_SECURE === "true"
    const url = `${secure ? "wss" : "ws"}://${host}:${port}/glasses-ws`
    console.log(`ServerComms: getServerUrl(): ${url}`)
    return url
  }

  parse_app_list(msg: any): ThirdPartyCloudApp[] {
    let installedApps = msg.installedApps
    let activeAppPackageNames = msg.activeAppPackageNames

    // If not found at top level, look under userSession
    if (!installedApps && msg.userSession) {
      installedApps = msg.userSession.installedApps
    }

    if (!activeAppPackageNames && msg.userSession) {
      activeAppPackageNames = msg.userSession.activeAppPackageNames
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

  static get_current_iso_datetime(): string {
    return new Date().toISOString()
  }

  send_transcription_result(transcription: any) {
    if (!this.wsManager.isConnected()) {
      console.log("Cannot send transcription result: WebSocket not connected")
      return
    }

    const text = transcription.text
    if (!text || text === "") {
      console.log("Skipping empty transcription result")
      return
    }

    try {
      const jsonString = JSON.stringify(transcription)
      this.wsManager.sendText(jsonString)

      const isFinal = transcription.isFinal || false
      console.log(`Sent ${isFinal ? "final" : "partial"} transcription: '${text}'`)
    } catch (error) {
      console.log(`Error sending transcription result: ${error}`)
    }
  }

  cleanup() {
    // Stop timers
    if (this.calendarSyncTimer) {
      clearInterval(this.calendarSyncTimer)
      this.calendarSyncTimer = null
    }

    if (this.datetimeTimer) {
      clearInterval(this.datetimeTimer)
      this.datetimeTimer = null
    }

    // Cleanup WebSocket
    this.wsManager.cleanup()

    // Reset instance
    ServerComms.instance = null
  }
}

export default ServerComms
