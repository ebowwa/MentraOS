import {NativeEventEmitter, NativeModules, Platform} from "react-native"
import {EventEmitter} from "events"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {INTENSE_LOGGING} from "@/consts"
import {
  isAugmentOsCoreInstalled,
  isLocationServicesEnabled as checkLocationServices,
  startExternalService,
} from "@/bridge/CoreServiceStarter"
import {check, PERMISSIONS, RESULTS} from "react-native-permissions"
import BleManager from "react-native-ble-manager"
import AudioPlayService, {AudioPlayResponse} from "@/services/AudioPlayService"
import {translate} from "@/i18n"
import {CoreStatusParser} from "@/utils/CoreStatusParser"
import settings, {SETTINGS_KEYS} from "@/managers/Settings"
import socketComms from "@/managers/SocketComms"
import livekitManager from "@/managers/LivekitManager"
import mantle from "@/managers/MantleManager"

const {BridgeModule, CoreCommsService} = NativeModules
const coreBridge = new NativeEventEmitter(BridgeModule)

export class MantleBridge extends EventEmitter {
  private static instance: MantleBridge | null = null
  private messageEventSubscription: any = null
  private validationInProgress: Promise<boolean> | null = null
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
        // Use our native module to check if location services are enabled
        const locationServicesEnabled = await checkLocationServices()
        console.log("Location services enabled (native check):", locationServicesEnabled)
        return locationServicesEnabled
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

    // iOS doesn't require location permission for BLE scanning since iOS 13
    if (Platform.OS === "ios") {
      return {isReady: true}
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
  async initialize() {
    setTimeout(async () => {
      const defaultWearable = await settings.get(SETTINGS_KEYS.default_wearable)
      const deviceName = await settings.get(SETTINGS_KEYS.device_name)
      this.sendConnectWearable(defaultWearable, deviceName)
    }, 3000)

    // Start the external service
    startExternalService()

    // Initialize message event listener
    this.initializeMessageEventListener()

    if (Platform.OS === "android") {
      // Set up audio play response callback
      AudioPlayService.setResponseCallback((response: AudioPlayResponse) => {
        this.sendAudioPlayResponse(response)
      })
    }

    // set the backend server url
    if (Platform.OS === "android") {
      const backendServerUrl = await settings.getRestUrl() // TODO: config: remove
      await this.setServerUrl(backendServerUrl) // TODO: config: remove
    }

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

    if (jsonString.startsWith("SWIFT:")) {
      console.log("SWIFT:", jsonString.slice(6))
      return
    }

    if (jsonString.startsWith("JAVA:")) {
      console.log("JAVA: ", jsonString.slice(6))
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

      // TODO: config: remove all of these and just use the typed messages
      if ("glasses_wifi_status_change" in data) {
        // console.log("Received glasses_wifi_status_change event from Core", data.glasses_wifi_status_change)
        GlobalEventEmitter.emit("GLASSES_WIFI_STATUS_CHANGE", {
          connected: data.glasses_wifi_status_change.connected,
          ssid: data.glasses_wifi_status_change.ssid,
          local_ip: data.glasses_wifi_status_change.local_ip,
        })
      } else if ("glasses_hotspot_status_change" in data) {
        // console.log("Received glasses_hotspot_status_change event from Core", data.glasses_hotspot_status_change)
        GlobalEventEmitter.emit("GLASSES_HOTSPOT_STATUS_CHANGE", {
          enabled: data.glasses_hotspot_status_change.enabled,
          ssid: data.glasses_hotspot_status_change.ssid,
          password: data.glasses_hotspot_status_change.password,
          local_ip: data.glasses_hotspot_status_change.local_ip,
        })
      } else if ("glasses_gallery_status" in data) {
        console.log("Received glasses_gallery_status event from Core", data.glasses_gallery_status)
        GlobalEventEmitter.emit("GLASSES_GALLERY_STATUS", {
          photos: data.glasses_gallery_status.photos,
          videos: data.glasses_gallery_status.videos,
          total: data.glasses_gallery_status.total,
          has_content: data.glasses_gallery_status.has_content,
          camera_busy: data.glasses_gallery_status.camera_busy, // Add camera busy state
        })
      } else if ("ping" in data) {
        // Heartbeat response - nothing to do
      } else if ("heartbeat_sent" in data) {
        console.log("💓 Received heartbeat_sent event from Core", data.heartbeat_sent)
        GlobalEventEmitter.emit("heartbeat_sent", {
          timestamp: data.heartbeat_sent.timestamp,
        })
      } else if ("heartbeat_received" in data) {
        console.log("💓 Received heartbeat_received event from Core", data.heartbeat_received)
        GlobalEventEmitter.emit("heartbeat_received", {
          timestamp: data.heartbeat_received.timestamp,
        })
      } else if ("notify_manager" in data) {
        GlobalEventEmitter.emit("SHOW_BANNER", {
          message: translate(data.notify_manager.message),
          type: data.notify_manager.type,
        })
      } else if ("compatible_glasses_search_result" in data) {
        GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_RESULT", {
          modelName: data.compatible_glasses_search_result.model_name,
          deviceName: data.compatible_glasses_search_result.device_name,
          deviceAddress: data.compatible_glasses_search_result.device_address,
        })
      } else if ("compatible_glasses_search_stop" in data) {
        GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_STOP", {
          modelName: data.compatible_glasses_search_stop.model_name,
        })
      } else if ("wifi_scan_results" in data) {
        console.log("🔍 ========= WIFI SCAN RESULTS RECEIVED =========")
        console.log("🔍 Received WiFi scan results from Core:", data)

        // Check for enhanced format first (from iOS)
        if ("wifi_scan_results_enhanced" in data) {
          console.log("🔍 Enhanced networks array:", data.wifi_scan_results_enhanced)
          console.log("🔍 Enhanced networks count:", data.wifi_scan_results_enhanced?.length || 0)
          GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
            networks: data.wifi_scan_results, // Legacy format for backwards compatibility
            networksEnhanced: data.wifi_scan_results_enhanced, // Enhanced format with security info
          })
          console.log("🔍 Emitted enhanced WIFI_SCAN_RESULTS event to GlobalEventEmitter")
        } else {
          console.log("🔍 Networks array:", data.wifi_scan_results)
          console.log("🔍 Networks count:", data.wifi_scan_results?.length || 0)
          GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
            networks: data.wifi_scan_results,
          })
          console.log("🔍 Emitted legacy WIFI_SCAN_RESULTS event to GlobalEventEmitter")
        }
        console.log("🔍 ========= END WIFI SCAN RESULTS =========")
      }

      if (!("type" in data)) {
        return
      }

      let binaryString
      let bytes

      switch (data.type) {
        case "app_started":
          console.log("APP_STARTED_EVENT", data.packageName)
          GlobalEventEmitter.emit("APP_STARTED_EVENT", data.packageName)
          break
        case "app_stopped":
          console.log("APP_STOPPED_EVENT", data.packageName)
          GlobalEventEmitter.emit("APP_STOPPED_EVENT", data.packageName)
          break
        case "audio_play_request":
          await AudioPlayService.handleAudioPlayRequest(data)
          break
        case "audio_stop_request":
          await AudioPlayService.stopAllAudio()
          break
        case "wifi_scan_results":
          GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
            networks: data.wifi_scan_results, // Legacy format for backwards compatibility
            networksEnhanced: data.wifi_scan_results_enhanced, // Enhanced format with security info
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
          await settings.set(data.key, data.value, false)
          break
        case "head_up":
          socketComms.sendHeadPosition(data.position)
          break
        // TODO: config: remove (this is legacy/android only)
        case "transcription_result":
          mantle.handleLocalTranscription(data)
          break
        case "local_transcription":
          mantle.handleLocalTranscription(data)
          break
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
          socketComms.sendBinary(bytes)
          // livekitManager.addPcm(bytes)
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
      params: {...(await settings.getCoreSettings())},
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
   * Validates that Core is responding to commands
   */
  private async validateResponseFromCore(): Promise<boolean> {
    if (this.validationInProgress || (await isAugmentOsCoreInstalled())) {
      return this.validationInProgress ?? true
    }

    this.validationInProgress = new Promise<boolean>((resolve, reject) => {
      const dataReceivedListener = () => {
        resolve(true)
      }

      this.once("dataReceived", dataReceivedListener)

      setTimeout(() => {
        this.removeListener("dataReceived", dataReceivedListener)
        resolve(false)
      }, 4500)
    }).then(result => {
      this.validationInProgress = null
      return result
    })

    return this.validationInProgress
  }

  /**
   * Sends data to Core
   */
  private async sendData(dataObj: any): Promise<any> {
    try {
      if (INTENSE_LOGGING) {
        console.log("Sending data to Core:", JSON.stringify(dataObj))
      }

      if (Platform.OS === "android") {
        // Ensure the service is running
        if (!(await CoreCommsService.isServiceRunning())) {
          CoreCommsService.startService()
        }
        return await CoreCommsService.sendCommandToCore(JSON.stringify(dataObj))
      }

      if (Platform.OS === "ios") {
        return await BridgeModule.sendCommand(JSON.stringify(dataObj))
      }
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
    return this.validateResponseFromCore()
  }

  async sendHeartbeat() {
    await this.sendData({command: "ping"})
    return this.validateResponseFromCore()
  }

  async sendSearchForCompatibleDeviceNames(modelName: string) {
    return await this.sendData({
      command: "search_for_compatible_device_names",
      params: {
        model_name: modelName,
      },
    })
  }

  async sendConnectWearable(modelName: string, deviceName: string = "", deviceAddress: string = "") {
    console.log(
      "sendConnectWearable modelName:",
      modelName,
      " deviceName",
      deviceName,
      " deviceAddress " + deviceAddress,
    )
    return await this.sendData({
      command: "connect_wearable",
      params: {
        model_name: modelName,
        device_name: deviceName,
        device_address: deviceAddress,
      },
    })
  }

  async sendPhoneNotification(
    appName: string = "",
    title: string = "",
    text: string = "",
    timestamp: number = -1,
    uuid: string = "",
  ) {
    return await this.sendData({
      command: "phone_notification",
      params: {
        appName: appName,
        title: title,
        text: text,
        timestamp: timestamp,
        uuid: uuid,
      },
    })
  }

  async sendDisconnectWearable() {
    return await this.sendData({command: "disconnect_wearable"})
  }

  async sendForgetSmartGlasses() {
    return await this.sendData({command: "forget_smart_glasses"})
  }

  // TODO: config: remove
  async sendToggleSensing(enabled: boolean) {
    return await this.sendData({
      command: "enable_sensing",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendToggleForceCoreOnboardMic(enabled: boolean) {
    return await this.sendData({
      command: "force_core_onboard_mic",
      params: {
        enabled: enabled,
      },
    })
  }

  async restartTranscription() {
    console.log("Restarting transcription with new model...")

    // Send restart command to native side
    await this.sendData({
      command: "restart_transcriber",
    })
  }

  // TODO: config: remove
  async sendSetPreferredMic(mic: string) {
    return await this.sendData({
      command: "set_preferred_mic",
      params: {
        mic: mic,
      },
    })
  }

  async sendSetButtonMode(mode: string) {
    return await this.sendData({
      command: "set_button_mode",
      params: {
        mode: mode,
      },
    })
  }

  async sendSetButtonPhotoSize(size: string) {
    return await this.sendData({
      command: "set_button_photo_size",
      params: {
        size: size,
      },
    })
  }

  async sendSetButtonVideoSettings(width: number, height: number, fps: number) {
    return await this.sendData({
      command: "set_button_video_settings",
      params: {
        width: width,
        height: height,
        fps: fps,
      },
    })
  }

  async sendSetButtonCameraLed(enabled: boolean) {
    return await this.sendData({
      command: "set_button_camera_led",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendToggleContextualDashboard(enabled: boolean) {
    return await this.sendData({
      command: "enable_contextual_dashboard",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendToggleBypassVadForDebugging(enabled: boolean) {
    return await this.sendData({
      command: "bypass_vad_for_debugging",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendTogglePowerSavingMode(enabled: boolean) {
    return await this.sendData({
      command: "enable_power_saving_mode",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendToggleBypassAudioEncodingForDebugging(enabled: boolean) {
    return await this.sendData({
      command: "bypass_audio_encoding_for_debugging",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendToggleEnforceLocalTranscription(enabled: boolean) {
    return await this.sendData({
      command: "enforce_local_transcription",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async sendToggleAlwaysOnStatusBar(enabled: boolean) {
    console.log("sendToggleAlwaysOnStatusBar")
    return await this.sendData({
      command: "enable_always_on_status_bar",
      params: {
        enabled: enabled,
      },
    })
  }

  // TODO: config: remove
  async setGlassesBrightnessMode(brightness: number, autoBrightness: boolean) {
    return await this.sendData({
      command: "update_glasses_brightness",
      params: {
        brightness: brightness,
        autoBrightness: autoBrightness,
      },
    })
  }

  // TODO: config: remove
  async setGlassesHeadUpAngle(headUpAngle: number) {
    return await this.sendData({
      command: "update_glasses_head_up_angle",
      params: {
        headUpAngle: headUpAngle,
      },
    })
  }

  // TODO: config: remove
  async setGlassesHeight(height: number) {
    return await this.sendData({
      command: "update_glasses_height",
      params: {height: height},
    })
  }

  // TODO: config: remove
  async setGlassesDepth(depth: number) {
    return await this.sendData({
      command: "update_glasses_depth",
      params: {depth: depth},
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
    return this.validateResponseFromCore()
  }

  async stopAppByPackageName(packageName: string) {
    await this.sendData({
      command: "stop_app",
      params: {
        target: packageName,
      },
    })
    return this.validateResponseFromCore()
  }

  async installAppByPackageName(packageName: string) {
    await this.sendData({
      command: "install_app_from_repository",
      params: {
        target: packageName,
      },
    })
    return this.validateResponseFromCore()
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

  async setup() {
    return await this.sendData({
      command: "setup",
    })
  }

  // TODO: config: remove
  async setAuthCreds(coreToken: string, userId: string) {
    return await this.sendData({
      command: "set_auth_secret_key",
      params: {
        userId: userId,
        authSecretKey: coreToken,
      },
    })
  }

  // TODO: config: remove
  async setServerUrl(url: string) {
    return await this.sendData({
      command: "set_server_url",
      params: {
        url: url,
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

  async stopService() {
    // Clean up any active listeners
    this.cleanup()

    if (Platform.OS === "android") {
      // Stop the service if it's running
      if (CoreCommsService && typeof CoreCommsService.stopService === "function") {
        CoreCommsService.stopService()
      }
    }
  }

  async sendSetMetricSystemEnabled(metricSystemEnabled: boolean) {
    return await this.sendData({
      command: "set_metric_system_enabled",
      params: {
        enabled: metricSystemEnabled,
      },
    })
  }

  async toggleUpdatingScreen(enabled: boolean) {
    return await this.sendData({
      command: "toggle_updating_screen",
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

  /**
   * Sends audio play response back to Core
   */
  private async sendAudioPlayResponse(response: AudioPlayResponse) {
    console.log(
      `Bridge: Sending audio play response for requestId: ${response.requestId}, success: ${response.success}`,
    )
    await this.sendData({
      command: "audio_play_response",
      params: {
        requestId: response.requestId,
        success: response.success,
        error: response.error,
        duration: response.duration,
      },
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
