import Config from "react-native-config"
import WebSocketManager, {WebSocketStatus} from "./WebSocketManager"
import coreCommunicator from "@/bridge/CoreCommunicator"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {saveSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"

// Type definitions
interface ThirdPartyCloudApp {
  packageName: string
  name: string
  description: string
  webhookURL: string
  logoURL: string
  isRunning: boolean
}

class ServerComms {
  private static instance: ServerComms | null = null

  private ws = WebSocketManager.getInstance()
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
    this.ws.on("message", message => {
      this.handle_incoming_message(message)
    })

    // Subscribe to WebSocket status changes
    this.ws.on("statusChange", status => {
      this.handleStatusChange(status)
    })

    this.setupPeriodicTasks()
  }

  public static getInstance(): ServerComms {
    if (!ServerComms.instance) {
      ServerComms.instance = new ServerComms()
    }
    return ServerComms.instance
  }

  private setupPeriodicTasks() {
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

  // Connection Management

  private getServerUrlForRest(): string {
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

  private getServerUrl(): string {
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
    console.log(`ServerCommsTS: getServerUrl(): ${url}`)
    return url
  }

  private connectWebsocket() {
    console.log("ServerCommsTS: connectWebsocket()")
    const url = this.getServerUrl()
    if (!url) {
      console.error(`ServerCommsTS: Invalid server URL`)
      return
    }
    this.ws.connect(url, this.coreToken)
  }

  private sendConnectionInit() {
    console.log("ServerCommsTS: Sending connection_init message")
    if (!this.coreToken) {
      console.error("ServerCommsTS: No core token found")
      return
    }

    try {
      const initMsg = {
        type: "connection_init",
        coreToken: this.coreToken,
      }

      const jsonString = JSON.stringify(initMsg)
      this.ws.sendText(jsonString)
      console.log("ServerCommsTS: Sent connection_init message")
    } catch (error) {
      console.log(`ServerCommsTS: Error building connection_init JSON: ${error}`)
    }
  }

  private attemptReconnect(override = false) {
    if (this.reconnecting && !override) return
    this.reconnecting = true

    this.connectWebsocket()

    // If after some time we're still not connected, run this function again
    setTimeout(() => {
      if (this.ws.isActuallyConnected()) {
        this.reconnectionAttempts = 0
        this.reconnecting = false
        return
      }
      this.reconnectionAttempts++
      this.attemptReconnect(true)
    }, 10000)
  }

  private handleStatusChange(status: WebSocketStatus) {
    console.log(`ServerCommsTS: handleStatusChange: ${status}`)

    if (status === WebSocketStatus.DISCONNECTED || status === WebSocketStatus.ERROR) {
      this.attemptReconnect()
    }

    if (status === WebSocketStatus.CONNECTED) {
      // Wait a bit before sending connection_init
      setTimeout(() => {
        this.sendConnectionInit()
        this.send_calendar_events()
        this.send_location_updates()
      }, 3000)
    }
  }

  isWebSocketConnected(): boolean {
    return this.ws.isActuallyConnected()
  }

  setServerUrl(url: string) {
    this.serverUrl = url
    console.log(`ServerCommsTS: setServerUrl: ${url}`)
    if (this.ws.isConnected()) {
      this.ws.disconnect()
      this.connectWebsocket()
    }
  }

  setAuthCredentials(userid: string, coreToken: string) {
    console.log(`ServerCommsTS: setAuthCredentials: ${userid}, ${coreToken}`)
    this.coreToken = coreToken
    this.userid = userid
    saveSetting(SETTINGS_KEYS.core_token, coreToken)
    this.connectWebsocket()
  }

  sendText(text: string) {
    try {
      this.ws.sendText(text)
    } catch (error) {
      console.log(`ServerCommsTS: Failed to send text: ${error}`)
    }
  }

  send_vad_status(isSpeaking: boolean) {
    const vadMsg = {
      type: "VAD",
      status: isSpeaking,
    }

    const jsonString = JSON.stringify(vadMsg)
    this.ws.sendText(jsonString)
  }

  send_battery_status(level: number, charging: boolean) {
    const msg = {
      type: "glasses_battery_update",
      level: level,
      charging: charging,
      timestamp: Date.now(),
    }

    const jsonString = JSON.stringify(msg)
    this.ws.sendText(jsonString)
  }

  send_calendar_event(calendarItem: any) {
    if (!this.ws.isConnected()) {
      console.log("ServerCommsTS: Cannot send calendar event: not connected.")
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building calendar_event JSON: ${error}`)
    }
  }

  async send_calendar_events() {
    if (!this.ws.isConnected()) return

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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building location_update JSON: ${error}`)
    }
  }

  send_location_updates() {
    if (!this.ws.isConnected()) {
      console.log("ServerCommsTS: Cannot send location updates: WebSocket not connected")
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building glasses_connection_state JSON: ${error}`)
    }
  }

  update_asr_config(languages: any[]) {
    if (!this.ws.isConnected()) {
      console.log("ServerCommsTS: Cannot send ASR config: not connected.")
      return
    }

    try {
      const configMsg = {
        type: "config",
        streams: languages,
      }

      const jsonString = JSON.stringify(configMsg)
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building config message: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building core_status_update JSON: ${error}`)
    }
  }

  send_audio_play_response(requestId: string, success: boolean, error?: string, duration?: number) {
    console.log(
      `ServerCommsTS: Sending audio play response - requestId: ${requestId}, success: ${success}, error: ${error || "none"}`,
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
      this.ws.sendText(jsonString)
      console.log("ServerCommsTS: Sent audio play response to server")
    } catch (err) {
      console.log(`ServerCommsTS: Failed to serialize audio play response: ${err}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building start_app JSON: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building stop_app JSON: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building button_press JSON: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building photo_response JSON: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error building video_stream_response JSON: ${error}`)
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
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`ServerCommsTS: Error sending head position: ${error}`)
    }
  }

  // Message Handling
  private handle_incoming_message(msg: any) {
    const type = msg.type
    if (!type) return

    console.log(`ServerCommsTS: handle_incoming_message: ${type}`)

    switch (type) {
      case "connection_ack":
        this.parse_app_list(msg)
        // coreCommunicator.sendCommand("connection_ack")
        break

      case "app_state_change":
        this.parse_app_list(msg)
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
        console.log(`ServerCommsTS: requiredData = ${requiredDataStrings}, bypassVad = ${bypassVad}`)
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

      case "reconnect":
        console.log("ServerCommsTS: Server is requesting a reconnect.")
        break

      case "settings_update":
        console.log("ServerCommsTS: Received settings update from WebSocket")
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
          console.log(`ServerCommsTS: Received app_started message for package: ${msg.packageName}`)
          coreCommunicator.sendCommand("app_started", {
            packageName: msg.packageName,
          })
        }
        break

      case "app_stopped":
        if (msg.packageName) {
          console.log(`ServerCommsTS: Received app_stopped message for package: ${msg.packageName}`)
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
        console.log(`ServerCommsTS: Received KEEP_RTMP_STREAM_ALIVE: ${JSON.stringify(msg)}`)
        coreCommunicator.sendCommand("keep_rtmp_stream_alive", msg)
        break

      case "start_buffer_recording":
        console.log("ServerCommsTS: Received START_BUFFER_RECORDING")
        coreCommunicator.sendCommand("start_buffer_recording")
        break

      case "stop_buffer_recording":
        console.log("ServerCommsTS: Received STOP_BUFFER_RECORDING")
        coreCommunicator.sendCommand("stop_buffer_recording")
        break

      case "save_buffer_video":
        console.log(`ServerCommsTS: Received SAVE_BUFFER_VIDEO: ${JSON.stringify(msg)}`)
        const bufferRequestId = msg.requestId || `buffer_${Date.now()}`
        const durationSeconds = msg.durationSeconds || 30
        coreCommunicator.sendCommand("save_buffer_video", {
          requestId: bufferRequestId,
          durationSeconds,
        })
        break

      case "start_video_recording":
        console.log(`ServerCommsTS: Received START_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
        const videoRequestId = msg.requestId || `video_${Date.now()}`
        const save = msg.save !== false
        coreCommunicator.sendCommand("start_video_recording", {
          requestId: videoRequestId,
          save,
        })
        break

      case "stop_video_recording":
        console.log(`ServerCommsTS: Received STOP_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
        const stopRequestId = msg.requestId || ""
        coreCommunicator.sendCommand("stop_video_recording", {
          requestId: stopRequestId,
        })
        break

      default:
        console.log(`ServerCommsTS: Unknown message type: ${type} / full: ${JSON.stringify(msg)}`)
    }
  }

  private handle_audio_play_request(msg: any) {
    console.log(`ServerCommsTS: Handling audio play request: ${JSON.stringify(msg)}`)
    const requestId = msg.requestId
    if (!requestId) return

    console.log(`ServerCommsTS: Handling audio play request for requestId: ${requestId}`)

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
    console.log("ServerCommsTS: Handling audio stop request")
    // Forward to native audio handling
    coreCommunicator.sendCommand("audio_stop_request")
  }

  // Helper methods
  async send_user_datetime_to_backend(isoDatetime: string) {
    const url = `${this.getServerUrlForRest()}/api/user-data/set-datetime`

    const body = {
      coreToken: this.coreToken,
      datetime: isoDatetime,
    }

    try {
      console.log(`ServerCommsTS: Sending datetime to: ${url}`)

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        const responseText = await response.text()
        console.log(`ServerCommsTS: Datetime transmission successful: ${responseText}`)
      } else {
        console.log(`ServerCommsTS: Datetime transmission failed. Response code: ${response.status}`)
        const errorText = await response.text()
        console.log(`ServerCommsTS: Error response: ${errorText}`)
      }
    } catch (error) {
      console.log(`ServerCommsTS: Exception during datetime transmission: ${error}`)
    }
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
    if (!this.ws.isConnected()) {
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
      this.ws.sendText(jsonString)

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
    this.ws.cleanup()

    // Reset instance
    ServerComms.instance = null
  }
}

export default ServerComms
