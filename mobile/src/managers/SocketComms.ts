import bridge from "@/bridge/MantleBridge"
import settings, {SETTINGS_KEYS} from "@/managers/Settings"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import wsManager, {WebSocketStatus} from "@/managers/WebSocketManager"
import {useDisplayStore} from "@/stores/display"
import livekitManager from "@/managers/LivekitManager"
import mantle from "@/managers/MantleManager"

class SocketComms {
  private static instance: SocketComms | null = null

  private ws = wsManager
  private coreToken: string = ""
  public userid: string = ""

  private reconnecting = false
  private reconnectionAttempts = 0

  private constructor() {
    // Subscribe to WebSocket messages
    this.ws.on("message", message => {
      this.handle_message(message)
    })
  }

  public static getInstance(): any {
    if (!SocketComms.instance) {
      SocketComms.instance = new SocketComms()
    }

    return SocketComms.instance
  }

  // Connection Management

  private async connectWebsocket() {
    console.log("SocketCommsTS: connectWebsocket()")
    const url = await settings.getWsUrl()
    if (!url) {
      console.error(`SocketCommsTS: Invalid server URL`)
      return
    }
    this.ws.connect(url, this.coreToken)
  }

  private attemptReconnect(override = false) {
    if (this.reconnecting && !override) return
    this.reconnecting = true

    this.connectWebsocket()

    // If after some time we're still not connected, run this function again
    setTimeout(() => {
      if (this.ws.isConnected()) {
        this.reconnectionAttempts = 0
        this.reconnecting = false
        return
      }
      this.reconnectionAttempts++
      this.attemptReconnect(true)
    }, 10000)
  }

  isWebSocketConnected(): boolean {
    return this.ws.isConnected()
  }

  restartConnection() {
    console.log(`SocketCommsTS: restartConnection`)
    if (this.ws.isConnected()) {
      this.ws.disconnect()
      this.connectWebsocket()
    }
  }

  setAuthCreds(coreToken: string, userid: string) {
    console.log(`SocketCommsTS: setAuthCreds(): ${coreToken}, ${userid}`)
    this.coreToken = coreToken
    this.userid = userid
    settings.set(SETTINGS_KEYS.core_token, coreToken)
    this.connectWebsocket()
  }

  sendText(text: string) {
    try {
      this.ws.sendText(text)
    } catch (error) {
      console.log(`SocketCommsTS: Failed to send text: ${error}`)
    }
  }

  sendBinary(data: ArrayBuffer | Uint8Array) {
    try {
      this.ws.sendBinary(data)
    } catch (error) {
      console.log(`SocketCommsTS: Failed to send binary: ${error}`)
    }
  }

  // SERVER COMMANDS
  // these are public functions that can be called from anywhere to notify the server of something:
  // should all be prefixed with send_

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
      console.log(`SocketCommsTS: Error building location_update JSON: ${error}`)
    }
  }

  send_location_updates() {
    if (!this.ws.isConnected()) {
      console.log("SocketCommsTS: Cannot send location updates: WebSocket not connected")
      return
    }

    // Request location from native side
    bridge.sendCommand("request_location_update")
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
      console.log(`SocketCommsTS: Error building glasses_connection_state JSON: ${error}`)
    }
  }

  update_asr_config(languages: any[]) {
    if (!this.ws.isConnected()) {
      console.log("SocketCommsTS: Cannot send ASR config: not connected.")
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
      console.log(`SocketCommsTS: Error building config message: ${error}`)
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
      console.log(`SocketCommsTS: Error building core_status_update JSON: ${error}`)
    }
  }

  // Hardware Events
  sendButtonPress(buttonId: string, pressType: string) {
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
      console.log(`SocketCommsTS: Error building button_press JSON: ${error}`)
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
      console.log(`SocketCommsTS: Error building photo_response JSON: ${error}`)
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
      console.log(`SocketCommsTS: Error building video_stream_response JSON: ${error}`)
    }
  }

  sendHeadPosition(isUp: boolean) {
    try {
      const event = {
        type: "head_position",
        position: isUp ? "up" : "down",
        timestamp: Date.now(),
      }

      const jsonString = JSON.stringify(event)
      this.ws.sendText(jsonString)
    } catch (error) {
      console.log(`SocketCommsTS: Error sending head position: ${error}`)
    }
  }

  // message handlers, these should only ever be called from handle_message / the server:
  private handle_connection_ack(msg: any) {
    console.log("SocketCommsTS: connection ack, connecting to livekit")
    livekitManager.connect()
    GlobalEventEmitter.emit("APP_STATE_CHANGE", msg)
  }

  private handle_app_state_change(msg: any) {
    // console.log("SocketCommsTS: app state change", msg)
    // this.parse_app_list(msg)
    GlobalEventEmitter.emit("APP_STATE_CHANGE", msg)
  }

  private handle_connection_error(msg: any) {
    console.error("SocketCommsTS: connection error", msg)
  }

  private handle_auth_error() {
    console.error("SocketCommsTS: auth error")
  }

  private handle_microphone_state_change(msg: any) {
    const bypassVad = msg.bypassVad || false
    const requiredDataStrings = msg.requiredData || []
    console.log(`SocketCommsTS: requiredData = ${requiredDataStrings}, bypassVad = ${bypassVad}`)
    bridge.sendCommand("microphone_state_change", {
      requiredData: requiredDataStrings,
      bypassVad,
    })
  }

  private handle_display_event(msg: any) {
    // console.log(`SocketCommsTS: Handling display event: ${JSON.stringify(msg)}`)
    if (msg.view) {
      bridge.sendCommand("display_event", msg)
      // Update the Zustand store with the display content
      const displayEvent = JSON.stringify(msg)
      useDisplayStore.getState().setDisplayEvent(displayEvent)
    }
  }

  private handle_audio_play_request(msg: any) {
    console.log(`SocketCommsTS: Handling audio play request: ${JSON.stringify(msg)}`)
    const requestId = msg.requestId
    if (!requestId) return

    console.log(`SocketCommsTS: Handling audio play request for requestId: ${requestId}`)

    const audioUrl = msg.audioUrl || ""
    const volume = msg.volume || 1.0
    const stopOtherAudio = msg.stopOtherAudio !== false

    // Forward to native audio handling through bridge
    bridge.sendCommand("audio_play_request", {
      requestId,
      audioUrl,
      volume,
      stopOtherAudio,
    })
  }

  private handle_audio_stop_request() {
    console.log("SocketCommsTS: Handling audio stop request")
    // Forward to native audio handling
    bridge.sendCommand("audio_stop_request")
  }

  private handle_set_location_tier(msg: any) {
    console.log("SocketCommsTS: DEBUG set_location_tier:", msg)
    const tier = msg.tier
    if (!tier) {
      console.log("SocketCommsTS: No tier provided")
      return
    }
    mantle.setLocationTier(tier)
  }

  private handle_request_single_location(msg: any) {
    console.log("SocketCommsTS: DEBUG request_single_location:", msg)
    if (msg.accuracy && msg.correlationId) {
      mantle.requestSingleLocation(msg.accuracy, msg.correlationId)
    }
  }

  private handle_app_started(msg: any) {
    const packageName = msg.packageName
    if (!packageName) {
      console.log("SocketCommsTS: No package name provided")
      return
    }
    console.log(`SocketCommsTS: Received app_started message for package: ${msg.packageName}`)
    bridge.sendCommand("app_started", {
      packageName: msg.packageName,
    })
  }
  private handle_app_stopped(msg: any) {
    console.log(`SocketCommsTS: Received app_stopped message for package: ${msg.packageName}`)
    bridge.sendCommand("app_stopped", {
      packageName: msg.packageName,
    })
  }

  private handle_photo_request(msg: any) {
    const requestId = msg.requestId || ""
    const appId = msg.appId || ""
    const webhookUrl = msg.webhookUrl || ""
    const size = msg.size || "medium"
    console.log(
      `Received photo_request, requestId: ${requestId}, appId: ${appId}, webhookUrl: ${webhookUrl}, size: ${size}`,
    )
    if (!requestId || !appId) {
      console.log("Invalid photo request: missing requestId or appId")
      return
    }
    bridge.sendCommand("photo_request", {
      requestId,
      appId,
      webhookUrl,
      size,
    })
  }

  private handle_start_rtmp_stream(msg: any) {
    const rtmpUrl = msg.rtmpUrl || ""
    if (rtmpUrl) {
      bridge.sendCommand("start_rtmp_stream", msg)
    } else {
      console.log("Invalid RTMP stream request: missing rtmpUrl")
    }
  }

  private handle_stop_rtmp_stream() {
    bridge.sendCommand("stop_rtmp_stream")
  }

  private handle_keep_rtmp_stream_alive(msg: any) {
    console.log(`SocketCommsTS: Received KEEP_RTMP_STREAM_ALIVE: ${JSON.stringify(msg)}`)
    bridge.sendCommand("keep_rtmp_stream_alive", msg)
  }

  private handle_save_buffer_video(msg: any) {
    console.log(`SocketCommsTS: Received SAVE_BUFFER_VIDEO: ${JSON.stringify(msg)}`)
    const bufferRequestId = msg.requestId || `buffer_${Date.now()}`
    const durationSeconds = msg.durationSeconds || 30
    bridge.sendCommand("save_buffer_video", {
      requestId: bufferRequestId,
      durationSeconds,
    })
  }

  private handle_start_buffer_recording(msg: any) {
    console.log("SocketCommsTS: Received START_BUFFER_RECORDING")
    bridge.sendCommand("start_buffer_recording")
  }

  private handle_stop_buffer_recording(msg: any) {
    console.log("SocketCommsTS: Received STOP_BUFFER_RECORDING")
    bridge.sendCommand("stop_buffer_recording")
  }

  private handle_start_video_recording(msg: any) {
    console.log(`SocketCommsTS: Received START_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
    const videoRequestId = msg.requestId || `video_${Date.now()}`
    const save = msg.save !== false
    bridge.sendCommand("start_video_recording", {
      requestId: videoRequestId,
      save,
    })
  }

  private handle_stop_video_recording(msg: any) {
    console.log(`SocketCommsTS: Received STOP_VIDEO_RECORDING: ${JSON.stringify(msg)}`)
    const stopRequestId = msg.requestId || ""
    bridge.sendCommand("stop_video_recording", {
      requestId: stopRequestId,
    })
  }

  // Message Handling
  private handle_message(msg: any) {
    const type = msg.type

    console.log(`SocketCommsTS: handle_incoming_message: ${type}`)

    switch (type) {
      case "connection_ack":
        this.handle_connection_ack(msg)
        // bridge.sendCommand("connection_ack")
        break

      case "app_state_change":
        this.handle_app_state_change(msg)
        break

      case "connection_error":
        this.handle_connection_error(msg)
        break

      case "auth_error":
        this.handle_auth_error()
        break

      case "microphone_state_change":
        this.handle_microphone_state_change(msg)
        break

      case "display_event":
        this.handle_display_event(msg)
        break

      case "audio_play_request":
        this.handle_audio_play_request(msg)
        break

      case "audio_stop_request":
        this.handle_audio_stop_request()
        break

      case "reconnect":
        console.log("SocketCommsTS: TODO: Server is requesting a reconnect.")
        break

      case "set_location_tier":
        this.handle_set_location_tier(msg)
        break

      case "request_single_location":
        this.handle_request_single_location(msg)
        break

      case "app_started":
        this.handle_app_started(msg)
        break

      case "app_stopped":
        this.handle_app_stopped(msg)
        break

      case "photo_request":
        this.handle_photo_request(msg)
        break

      case "start_rtmp_stream":
        this.handle_start_rtmp_stream(msg)
        break

      case "stop_rtmp_stream":
        this.handle_stop_rtmp_stream()
        break

      case "keep_rtmp_stream_alive":
        this.handle_keep_rtmp_stream_alive(msg)
        break

      case "start_buffer_recording":
        this.handle_start_buffer_recording(msg)
        break

      case "stop_buffer_recording":
        this.handle_stop_buffer_recording(msg)
        break

      case "save_buffer_video":
        this.handle_save_buffer_video(msg)
        break

      case "start_video_recording":
        this.handle_start_video_recording(msg)
        break

      case "stop_video_recording":
        this.handle_stop_video_recording(msg)
        break

      default:
        console.log(`SocketCommsTS: Unknown message type: ${type} / full: ${JSON.stringify(msg)}`)
    }
  }

  sendLocalTranscription(transcription: any) {
    if (!this.ws.isConnected()) {
      console.log("Cannot send local transcription: WebSocket not connected")
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
      console.log(`SocketCommsTS: Sent ${isFinal ? "final" : "partial"} transcription: '${text}'`)
    } catch (error) {
      console.log(`Error sending transcription result: ${error}`)
    }
  }

  cleanup() {
    // Cleanup WebSocket
    this.ws.cleanup()

    // Reset instance
    SocketComms.instance = null
  }
}

const socketComms = SocketComms.getInstance()
export default socketComms
