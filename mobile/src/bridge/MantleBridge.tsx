import {INTENSE_LOGGING} from "@/utils/Constants"
import {translate} from "@/i18n"
import livekit from "@/services/Livekit"
import mantle from "@/services/MantleManager"
import socketComms from "@/services/SocketComms"
import {useSettingsStore} from "@/stores/settings"
import {CoreStatusParser} from "@/utils/CoreStatusParser"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

import CoreModule from "core"
import Toast from "react-native-toast-message"

export class MantleBridge {
  private static instance: MantleBridge | null = null
  private messageEventSubscription: any = null
  private lastMessage: string = ""

  // Private constructor to enforce singleton pattern
  private constructor() {
    // Initialize message event listener
    this.initializeMessageEventListener()
  }

  /**
   * Gets the singleton instance of Bridge
   */
  public static getInstance(): MantleBridge {
    if (!MantleBridge.instance) {
      MantleBridge.instance = new MantleBridge()
    }
    return MantleBridge.instance
  }

  // does nothing but ensures we initialize the class:
  public async dummy() {
    await Promise.resolve()
  }

  /**
   * Initializes the event listener for Core messages
   */
  private initializeMessageEventListener() {
    // Remove any existing subscription to avoid duplicates
    if (this.messageEventSubscription) {
      this.messageEventSubscription.remove()
      this.messageEventSubscription = null
    }

    // Create a fresh subscription
    this.messageEventSubscription = CoreModule.addListener("CoreMessageEvent", (event: any) => {
      // expo adds the body to the event object
      this.handleCoreMessage(event.body)
    })

    console.log("Core message event listener initialized")
  }

  /**
   * Handles incoming messages from Core
   */
  private handleCoreMessage(jsonString: string) {
    if (INTENSE_LOGGING) {
      console.log("Received message from core:", jsonString)
    }

    if (jsonString.startsWith("CORE:")) {
      console.log("CORE:", jsonString.slice(5))
      return
    }

    try {
      const data = JSON.parse(jsonString)

      // Only check for duplicates on status messages, not other event types
      if ("status" in data) {
        if (this.lastMessage === jsonString) {
          console.log("BRIDGE: DUPLICATE STATUS MESSAGE FROM CORE")
          return
        }
        this.lastMessage = jsonString
      }

      this.parseDataFromCore(data)
    } catch (e) {
      console.error("BRIDGE: Failed to parse JSON from core message:", e)
      console.log(jsonString)
    }
  }

  /**
   * Parses various types of data received from Core
   */
  private async parseDataFromCore(data: any) {
    if (!data) return

    try {
      if ("status" in data) {
        GlobalEventEmitter.emit("CORE_STATUS_UPDATE", data)
        return
      }

      if (!("type" in data)) {
        return
      }

      let binaryString
      let bytes

      switch (data.type) {
        case "wifi_status_change":
          GlobalEventEmitter.emit("WIFI_STATUS_CHANGE", {
            connected: data.connected,
            ssid: data.ssid,
            local_ip: data.local_ip,
          })
          break
        case "hotspot_status_change":
          GlobalEventEmitter.emit("HOTSPOT_STATUS_CHANGE", {
            enabled: data.enabled,
            ssid: data.ssid,
            password: data.password,
            local_ip: data.local_ip,
          })
          break
        case "gallery_status":
          GlobalEventEmitter.emit("GALLERY_STATUS", {
            photos: data.photos,
            videos: data.videos,
            total: data.total,
            has_content: data.has_content,
            camera_busy: data.camera_busy, // Add camera busy state
          })
          break
        case "compatible_glasses_search_result":
          console.log("Received compatible_glasses_search_result event from Core", data)
          GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_RESULT", {
            modelName: data.model_name,
            deviceName: data.device_name,
            deviceAddress: data.device_address,
          })
          break
        case "compatible_glasses_search_stop":
          GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_STOP", {
            model_name: data.model_name,
          })
          break
        case "heartbeat_sent":
          console.log("💓 Received heartbeat_sent event from Core", data.heartbeat_sent)
          GlobalEventEmitter.emit("heartbeat_sent", {
            timestamp: data.heartbeat_sent.timestamp,
          })
          break
        case "heartbeat_received":
          console.log("💓 Received heartbeat_received event from Core", data.heartbeat_received)
          GlobalEventEmitter.emit("heartbeat_received", {
            timestamp: data.heartbeat_received.timestamp,
          })
          break
        case "notify_manager":
        case "show_banner":
          Toast.show({
            type: data.notify_manager.type,
            text1: translate(data.notify_manager.message),
          })
          break
        case "button_press":
          console.log("🔘 BUTTON_PRESS event received:", data)
          // Emit event to React Native layer for handling
          GlobalEventEmitter.emit("BUTTON_PRESS", {
            buttonId: data.buttonId,
            pressType: data.pressType,
            timestamp: data.timestamp,
          })
          // Also forward to server for apps that need it
          socketComms.sendButtonPress(data.buttonId, data.pressType)
          break
        case "touch_event": {
          const deviceModel = data.device_model ?? "Mentra Live"
          const gestureName = data.gesture_name ?? "unknown"
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          GlobalEventEmitter.emit("TOUCH_EVENT", {
            deviceModel,
            gestureName,
            timestamp,
          })
          socketComms.sendTouchEvent({
            device_model: deviceModel,
            gesture_name: gestureName,
            timestamp,
          })
          break
        }
        case "swipe_volume_status": {
          const enabled = !!data.enabled
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          socketComms.sendSwipeVolumeStatus(enabled, timestamp)
          GlobalEventEmitter.emit("SWIPE_VOLUME_STATUS", {enabled, timestamp})
          break
        }
        case "switch_status": {
          const switchType = typeof data.switch_type === "number" ? data.switch_type : (data.switchType ?? -1)
          const switchValue = typeof data.switch_value === "number" ? data.switch_value : (data.switchValue ?? -1)
          const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now()
          socketComms.sendSwitchStatus(switchType, switchValue, timestamp)
          GlobalEventEmitter.emit("SWITCH_STATUS", {switchType, switchValue, timestamp})
          break
        }
        case "rgb_led_control_response": {
          const requestId = data.requestId ?? ""
          const success = !!data.success
          const errorMessage = typeof data.error === "string" ? data.error : null
          socketComms.sendRgbLedControlResponse(requestId, success, errorMessage)
          GlobalEventEmitter.emit("RGB_LED_CONTROL_RESPONSE", {requestId, success, error: errorMessage})
          break
        }
        case "wifi_scan_results":
          GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
            networks: data.networks,
          })
          break
        case "pair_failure":
          GlobalEventEmitter.emit("PAIR_FAILURE", data.error)
          break
        case "save_setting":
          await useSettingsStore.getState().setSetting(data.key, data.value, false)
          break
        case "head_position":
          socketComms.sendHeadPosition(data.position === "up")
          break
        case "local_transcription":
          mantle.handleLocalTranscription(data)
          break
        // TODO: this is a bit of a hack, we should have dedicated functions for ws endpoints in the core:
        case "ws_text":
          socketComms.sendText(data.text)
          break
        case "ws_bin":
          binaryString = atob(data.base64)
          bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          socketComms.sendBinary(bytes)
          break
        case "mic_data":
          binaryString = atob(data.base64)
          bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          if (livekit.isRoomConnected()) {
            livekit.addPcm(bytes)
          } else {
            socketComms.sendBinary(bytes)
          }
          break
        case "rtmp_stream_status":
          console.log("MantleBridge: Forwarding RTMP stream status to server:", data)
          socketComms.sendRtmpStreamStatus(data)
          break
        case "keep_alive_ack":
          console.log("MantleBridge: Forwarding keep-alive ACK to server:", data)
          socketComms.sendKeepAliveAck(data)
          break
        default:
          console.log("Unknown event type:", data.type)
          break
      }
    } catch (e) {
      console.error("Error parsing data from Core:", e)
      GlobalEventEmitter.emit("CORE_STATUS_UPDATE", CoreStatusParser.defaultStatus)
    }
  }

  /**
   * Cleans up resources and resets the state
   */
  public cleanup() {
    // Remove message event listener
    if (this.messageEventSubscription) {
      this.messageEventSubscription.remove()
      this.messageEventSubscription = null
    }

    // Reset the singleton instance
    MantleBridge.instance = null

    console.log("Bridge cleaned up")
  }

  /* Command methods to interact with Core */

  async sendToggleEnforceLocalTranscription(enabled: boolean) {
    console.log("Toggling enforce local transcription:", enabled)
    return await CoreModule.updateSettings({
      enforce_local_transcription: enabled,
    })
  }

  async updateButtonPhotoSize(size: string) {
    return await CoreModule.updateSettings({
      button_photo_size: size,
    })
  }

  async updateButtonVideoSettings(width: number, height: number, fps: number) {
    return await CoreModule.updateSettings({
      button_video_width: width,
      button_video_height: height,
      button_video_fps: fps,
    })
  }

  async showDashboard() {
    return await CoreModule.showDashboard()
  }

  async updateSettings(settings: any) {
    return await CoreModule.updateSettings(settings)
  }

  async setGlassesWifiCredentials(ssid: string, _password: string) {
    // TODO: Add setGlassesWifiCredentials to CoreModule
    console.warn("setGlassesWifiCredentials not yet implemented in new CoreModule API")
    console.log("Would set credentials:", ssid)
  }

  async disconnectFromWifi() {
    console.log("Sending WiFi disconnect command to Core")
    // TODO: Add disconnectWifi to CoreModule
    console.warn("disconnectFromWifi not yet implemented in new CoreModule API")
  }

  async setLc3AudioEnabled(enabled: boolean) {
    console.log("setLc3AudioEnabled", enabled)
    // TODO: Add setLc3AudioEnabled to CoreModule
    console.warn("setLc3AudioEnabled not yet implemented in new CoreModule API")
  }
  // Buffer recording commands
  async sendStartBufferRecording() {
    return await CoreModule.startBufferRecording()
  }

  async sendStopBufferRecording() {
    return await CoreModule.stopBufferRecording()
  }

  async sendSaveBufferVideo(requestId: string, durationSeconds: number = 30) {
    return await CoreModule.saveBufferVideo(requestId, durationSeconds)
  }

  // Video recording commands
  async sendStartVideoRecording(requestId: string, save: boolean = true) {
    return await CoreModule.startVideoRecording(requestId, save)
  }

  async sendStopVideoRecording(requestId: string) {
    return await CoreModule.stopVideoRecording(requestId)
  }

  async setSttModelDetails(path: string, languageCode: string) {
    return await CoreModule.setSttModelDetails(path, languageCode)
  }

  async getSttModelPath(): Promise<string> {
    return await CoreModule.getSttModelPath()
  }

  async validateSTTModel(path: string): Promise<boolean> {
    return await CoreModule.validateSttModel(path)
  }

  async extractTarBz2(sourcePath: string, destinationPath: string) {
    return await CoreModule.extractTarBz2(sourcePath, destinationPath)
  }

  async queryGalleryStatus() {
    console.log("[Bridge] Querying gallery status from glasses...")
    return await CoreModule.queryGalleryStatus()
  }
}

// Create and export the singleton instance
const bridge = MantleBridge.getInstance()
export default bridge
