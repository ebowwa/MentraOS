import {NativeEventEmitter, NativeModules, Platform} from "react-native"
import {EventEmitter} from "events"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {INTENSE_LOGGING} from "@/consts"
import {check, PERMISSIONS, RESULTS} from "react-native-permissions"
import BleManager from "react-native-ble-manager"
import {translate} from "@/i18n"
import {CoreStatusParser} from "@/utils/CoreStatusParser"
import socketComms from "@/managers/SocketComms"
import livekitManager from "@/managers/LivekitManager"
import mantle from "@/managers/MantleManager"
import {useSettingsStore} from "@/stores/settings"

const {BridgeModule} = NativeModules
const coreBridge = new NativeEventEmitter(BridgeModule)

export class MantleBridge extends EventEmitter {
  private static instance: MantleBridge | null = null
  private messageEventSubscription: any = null
  private reconnectionTimer: NodeJS.Timeout | null = null
  private isConnected: boolean = false
  private lastMessage: string = ""

  // Private constructor to enforce singleton pattern
  private constructor() {
    super()
  }

  // Utility methods for checking permissions and device capabilities
  async isBluetoothEnabled(): Promise<boolean> {
    try {
      console.log("Checking Bluetooth state...")
      await BleManager.start({showAlert: false})

      // Poll for Bluetooth state every 50ms, up to 10 times (max 500ms)
      for (let attempt = 0; attempt < 10; attempt++) {
        const state = await BleManager.checkState()
        console.log(`Bluetooth state check ${attempt + 1}:`, state)

        if (state !== "unknown") {
          console.log("Bluetooth state determined:", state)
          return state === "on"
        }

        // Wait 50ms before next check
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // If still unknown after 10 attempts, assume it's available
      console.log("Bluetooth state still unknown after 500ms, assuming available")
      return true
    } catch (error) {
      console.error("Error checking Bluetooth state:", error)
      return false
    }
  }

  async isLocationPermissionGranted(): Promise<boolean> {
    try {
      if (Platform.OS === "android") {
        const result = await check(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION)
        return result === RESULTS.GRANTED
      } else if (Platform.OS === "ios") {
        // iOS doesn't require location permission for BLE scanning since iOS 13
        return true
      }
      return false
    } catch (error) {
      console.error("Error checking location permission:", error)
      return false
    }
  }

  async isLocationServicesEnabled(): Promise<boolean> {
    try {
      if (Platform.OS === "android") {
        // // Use our native module to check if location services are enabled
        // const locationServicesEnabled = await checkLocationServices()
        // console.log("Location services enabled (native check):", locationServicesEnabled)
        // return locationServicesEnabled
        return true // TODO: fix this!
      } else if (Platform.OS === "ios") {
        // iOS doesn't require location for BLE scanning since iOS 13
        return true
      }
      return true
    } catch (error) {
      console.error("Error checking if location services are enabled:", error)
      return false
    }
  }

  async checkConnectivityRequirements(): Promise<{
    isReady: boolean
    message?: string
    requirement?: "bluetooth" | "location" | "locationServices" | "permissions"
  }> {
    console.log("Checking connectivity requirements")

    // Check Bluetooth state on both iOS and Android
    const isBtEnabled = await this.isBluetoothEnabled()
    console.log("Is Bluetooth enabled:", isBtEnabled)
    if (!isBtEnabled) {
      console.log("Bluetooth is disabled, showing error")
      return {
        isReady: false,
        message: "Bluetooth is required to connect to glasses. Please enable Bluetooth and try again.",
        requirement: "bluetooth",
      }
    }

    // Only check location on Android
    if (Platform.OS === "android") {
      // First check if location permission is granted
      const isLocationPermissionGranted = await this.isLocationPermissionGranted()
      console.log("Is Location permission granted:", isLocationPermissionGranted)
      if (!isLocationPermissionGranted) {
        console.log("Location permission missing, showing error")
        return {
          isReady: false,
          message:
            "Location permission is required to scan for glasses on Android. Please grant location permission and try again.",
          requirement: "location",
        }
      }

      // Then check if location services are enabled
      const isLocationServicesEnabled = await this.isLocationServicesEnabled()
      console.log("Are Location services enabled:", isLocationServicesEnabled)
      if (!isLocationServicesEnabled) {
        console.log("Location services disabled, showing error")
        return {
          isReady: false,
          message:
            "Location services are disabled. Please enable location services in your device settings and try again.",
          requirement: "locationServices",
        }
      }
    }

    console.log("All requirements met")
    return {isReady: true}
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

  /**
   * Initializes the communication channel with Core
   */
  async init() {
    setTimeout(async () => {
      this.sendConnectDefault()
    }, 3000)

    // Start the external service
    // startExternalService()

    // Initialize message event listener
    this.initializeMessageEventListener()

    this.sendSettings()

    // Start periodic status checks
    this.startStatusPolling()

    // Request initial status
    this.sendRequestStatus()
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
    this.messageEventSubscription = coreBridge.addListener("CoreMessageEvent", this.handleCoreMessage.bind(this))

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
          console.log("DUPLICATE STATUS MESSAGE FROM CORE")
          return
        }
        this.lastMessage = jsonString
      }

      this.isConnected = true
      this.emit("dataReceived", data)
      this.parseDataFromCore(data)
    } catch (e) {
      console.error("Failed to parse JSON from core message:", e)
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
          GlobalEventEmitter.emit("SHOW_BANNER", {
            message: translate(data.notify_manager.message),
            type: data.notify_manager.type,
          })
          break
        case "audio_stop_request":
          await bridge.sendCommand("audio_stop_request")
          break
        case "wifi_scan_results":
          GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
            networks: data.networks,
          })
          break
        case "pair_failure":
          GlobalEventEmitter.emit("PAIR_FAILURE", data.error)
          break
        case "show_banner":
          GlobalEventEmitter.emit("SHOW_BANNER", {
            message: data.message,
            type: data.type,
          })
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
          if (livekitManager.isRoomConnected()) {
            livekitManager.addPcm(bytes)
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

  private async sendSettings() {
    this.sendData({
      command: "update_settings",
      params: {...(await useSettingsStore.getState().getCoreSettings())},
    })
  }

  /**
   * Starts periodic status polling to maintain connection
   */
  private startStatusPolling() {
    this.stopStatusPolling()

    const pollStatus = () => {
      this.sendRequestStatus()
      this.reconnectionTimer = setTimeout(
        pollStatus,
        this.isConnected ? 999000 : 2000, // Poll more frequently when not connected
      )
    }

    pollStatus()
  }

  /**
   * Stops the status polling timer
   */
  private stopStatusPolling() {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer)
      this.reconnectionTimer = null
    }
  }

  /**
   * Sends data to Core
   */
  private async sendData(dataObj: any): Promise<any> {
    try {
      // if (INTENSE_LOGGING) {
      console.log("Sending data to Core:", JSON.stringify(dataObj))
      // }

      // if (Platform.OS === "android") {
      //   // Ensure the service is running
      //   if (!(await CoreCommsService.isServiceRunning())) {
      //     CoreCommsService.startService()
      //   }
      //   return await CoreCommsService.sendCommandToCore(JSON.stringify(dataObj))
      // }

      return await BridgeModule.sendCommand(JSON.stringify(dataObj))
    } catch (error) {
      console.error("Failed to send data to Core:", error)
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: `Error sending command to Core: ${error}`,
        type: "error",
      })
    }
  }

  /**
   * Cleans up resources and resets the state
   */
  public cleanup() {
    // Stop the status polling
    this.stopStatusPolling()

    // Remove message event listener
    if (this.messageEventSubscription) {
      this.messageEventSubscription.remove()
      this.messageEventSubscription = null
    }

    // Reset connection state
    this.isConnected = false

    // Reset the singleton instance
    MantleBridge.instance = null

    console.log("Bridge cleaned up")
  }

  /* Command methods to interact with Core */

  async sendRequestStatus() {
    await this.sendData({command: "request_status"})
  }

  async sendHeartbeat() {
    await this.sendData({command: "ping"})
  }

  async sendSearchForCompatibleDeviceNames(modelName: string) {
    return await this.sendData({
      command: "find_compatible_devices",
      params: {
        model_name: modelName,
      },
    })
  }

  async sendConnectDefault() {
    return await this.sendData({
      command: "connect_default",
    })
  }

  async sendConnectByName(deviceName: string = "") {
    console.log("sendConnectByName:", " deviceName")
    return await this.sendData({
      command: "connect_by_name",
      params: {
        device_name: deviceName,
      },
    })
  }

  async sendDisconnectWearable() {
    return await this.sendData({command: "disconnect"})
  }

  async sendForgetSmartGlasses() {
    return await this.sendData({command: "forget"})
  }

  async restartTranscription() {
    console.log("Restarting transcription with new model...")

    // Send restart command to native side
    await this.sendData({
      command: "restart_transcriber",
    })
  }

  async sendToggleEnforceLocalTranscription(enabled: boolean) {
    console.log("Toggling enforce local transcription:", enabled)

    // Send toggle command to native side
    await this.sendData({
      command: "toggle_enforce_local_transcription",
      params: {
        enabled: enabled,
      },
    })
  }

  async updateButtonPhotoSize(size: string) {
    return await this.sendData({
      command: "update_settings",
      params: {
        button_photo_size: size,
      },
    })
  }

  async updateButtonVideoSettings(width: number, height: number, fps: number) {
    return await this.sendData({
      command: "update_settings",
      params: {
        button_video_width: width,
        button_video_height: height,
        button_video_fps: fps,
      },
    })
  }

  async showDashboard() {
    return await this.sendData({
      command: "show_dashboard",
    })
  }

  async startAppByPackageName(packageName: string) {
    await this.sendData({
      command: "start_app",
      params: {
        target: packageName,
        repository: packageName,
      },
    })
  }

  async stopAppByPackageName(packageName: string) {
    await this.sendData({
      command: "stop_app",
      params: {
        target: packageName,
      },
    })
  }

  async installAppByPackageName(packageName: string) {
    await this.sendData({
      command: "install_app_from_repository",
      params: {
        target: packageName,
      },
    })
  }

  async sendRequestAppDetails(packageName: string) {
    return await this.sendData({
      command: "request_app_info",
      params: {
        target: packageName,
      },
    })
  }

  async sendUpdateAppSetting(packageName: string, settingsDeltaObj: any) {
    return await this.sendData({
      command: "update_app_settings",
      params: {
        target: packageName,
        settings: settingsDeltaObj,
      },
    })
  }

  async sendUninstallApp(packageName: string) {
    return await this.sendData({
      command: "uninstall_app",
      params: {
        target: packageName,
      },
    })
  }

  async updateSettings(settings: any) {
    return await this.sendData({
      command: "update_settings",
      params: {
        ...settings,
      },
    })
  }

  async setGlassesWifiCredentials(ssid: string, password: string) {
    return await this.sendData({
      command: "set_glasses_wifi_credentials",
      params: {
        ssid,
        password,
      },
    })
  }

  async sendWifiCredentials(ssid: string, password: string) {
    console.log("Sending wifi credentials to Core", ssid, password)
    return await this.sendData({
      command: "send_wifi_credentials",
      params: {
        ssid,
        password,
      },
    })
  }

  async requestWifiScan() {
    return await this.sendData({
      command: "request_wifi_scan",
    })
  }

  async disconnectFromWifi() {
    console.log("Sending WiFi disconnect command to Core")
    return await this.sendData({
      command: "disconnect_wifi",
    })
  }

  async stopService() {
    // Clean up any active listeners
    this.cleanup()

    // if (Platform.OS === "android") {
    //   // Stop the service if it's running
    //   if (CoreCommsService && typeof CoreCommsService.stopService === "function") {
    //     CoreCommsService.stopService()
    //   }
    // }
  }

  async toggleUpdatingScreen(enabled: boolean) {
    return await this.sendData({
      command: "update_settings",
      params: {
        enabled: enabled,
      },
    })
  }

  async simulateHeadPosition(position: "up" | "down") {
    return await this.sendData({
      command: "simulate_head_position",
      params: {
        position: position,
      },
    })
  }

  async simulateButtonPress(buttonId: string = "camera", pressType: "short" | "long" = "short") {
    return await this.sendData({
      command: "simulate_button_press",
      params: {
        buttonId: buttonId,
        pressType: pressType,
      },
    })
  }

  async sendDisplayText(text: string, x: number, y: number, size: number) {
    console.log("sendDisplayText", text, x, y, size)

    return await this.sendData({
      command: "display_text",
      params: {
        text: text,
        x: x,
        y: y,
        size: size,
      },
    })
  }

  async sendDisplayImage(imageType: string, imageSize: string) {
    return await this.sendData({
      command: "display_image",
      params: {
        imageType: imageType,
        imageSize: imageSize,
      },
    })
  }

  async sendClearDisplay() {
    return await this.sendData({
      command: "clear_display",
    })
  }

  async setLc3AudioEnabled(enabled: boolean) {
    console.log("setLc3AudioEnabled", enabled)
    return await this.sendData({
      command: "set_lc3_audio_enabled",
      enabled: enabled,
    })
  }
  // Buffer recording commands
  async sendStartBufferRecording() {
    return await this.sendData({
      command: "start_buffer_recording",
    })
  }

  async sendStopBufferRecording() {
    return await this.sendData({
      command: "stop_buffer_recording",
    })
  }

  async sendSaveBufferVideo(requestId: string, durationSeconds: number = 30) {
    return await this.sendData({
      command: "save_buffer_video",
      params: {
        request_id: requestId,
        duration_seconds: durationSeconds,
      },
    })
  }

  // Video recording commands
  async sendStartVideoRecording(requestId: string, save: boolean = true) {
    return await this.sendData({
      command: "start_video_recording",
      params: {
        request_id: requestId,
        save: save,
      },
    })
  }

  async sendStopVideoRecording(requestId: string) {
    return await this.sendData({
      command: "stop_video_recording",
      params: {
        request_id: requestId,
      },
    })
  }

  async sendCommand(command: string, params?: any) {
    return await this.sendData({
      command: command,
      params: params || {},
    })
  }

  async setSttModelDetails(path: string, languageCode: string) {
    return await this.sendData({
      command: "set_stt_model_details",
      params: {
        path: path,
        languageCode: languageCode,
      },
    })
  }

  async getSttModelPath(): Promise<string> {
    return await this.sendData({
      command: "get_stt_model_path",
    })
  }

  async validateSTTModel(path: string): Promise<boolean> {
    return await this.sendData({
      command: "validate_stt_model",
      params: {
        path: path,
      },
    })
  }

  async extractTarBz2(sourcePath: string, destinationPath: string) {
    return await this.sendData({
      command: "extract_tar_bz2",
      params: {
        source_path: sourcePath,
        destination_path: destinationPath,
      },
    })
  }

  async queryGalleryStatus() {
    console.log("[Bridge] Querying gallery status from glasses...")
    // Just send the command, the response will come through the event system
    return this.sendCommand("query_gallery_status")
  }
}

// Create and export the singleton instance
const bridge = MantleBridge.getInstance()
export default bridge
