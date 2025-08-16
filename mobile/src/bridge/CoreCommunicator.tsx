import {NativeEventEmitter, NativeModules, Platform} from "react-native"
import {EventEmitter} from "events"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {INTENSE_LOGGING} from "@/consts"
import {
  isAugmentOsCoreInstalled,
  isLocationServicesEnabled as checkLocationServices,
  startExternalService,
} from "./CoreServiceStarter"
import {check, PERMISSIONS, RESULTS} from "react-native-permissions"
import BleManager from "react-native-ble-manager"
import BackendServerComms from "@/backend_comms/BackendServerComms"
import AudioPlayService, {AudioPlayResponse} from "@/services/AudioPlayService"
import {translate} from "@/i18n"
import AugmentOSParser from "@/utils/AugmentOSStatusParser"

const {CoreCommsService, AOSModule} = NativeModules
const eventEmitter = new NativeEventEmitter(CoreCommsService)

export class CoreCommunicator extends EventEmitter {
  private static instance: CoreCommunicator | null = null
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
   * Gets the singleton instance of CoreCommunicator
   */
  public static getInstance(): CoreCommunicator {
    if (!CoreCommunicator.instance) {
      CoreCommunicator.instance = new CoreCommunicator()
    }
    return CoreCommunicator.instance
  }

  /**
   * Initializes the communication channel with Core
   */
  async initialize() {
    if (Platform.OS === "ios") {
      setTimeout(async () => {
        // will fail silently if we don't have bt permissions (which is the intended behavior)
        AOSModule.sendCommand(JSON.stringify({command: "connect_wearable"}))
      }, 3000)
    }

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
    const backendServerUrl = await BackendServerComms.getInstance().getServerUrl()
    await this.setServerUrl(backendServerUrl)

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
    this.messageEventSubscription = eventEmitter.addListener("CoreMessageEvent", this.handleCoreMessage.bind(this))

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
      console.log("SWIFT: ", jsonString.slice(6))
      return
    }

    if (jsonString.startsWith("JAVA:")) {
      console.log("JAVA: ", jsonString.slice(6))
      return
    }

    // console.log("RECEIVED MESSAGE FROM CORE")
    if (this.lastMessage === jsonString) {
      console.log("DUPLICATE MESSAGE FROM CORE")
      return
    }
    this.lastMessage = jsonString

    try {
      const data = JSON.parse(jsonString)

      // Log if this is a WiFi scan result
      if ("wifi_scan_results" in data) {
        console.log("📡 ========= RAW MESSAGE FROM CORE =========")
        console.log("📡 Raw JSON string:", jsonString)
        console.log("📡 Parsed data:", data)
        console.log("📡 ========= END RAW MESSAGE =========")
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
        this.emit("statusUpdateReceived", data)
        return
      }

      if ("glasses_wifi_status_change" in data) {
        // console.log("Received glasses_wifi_status_change event from Core", data.glasses_wifi_status_change)
        GlobalEventEmitter.emit("GLASSES_WIFI_STATUS_CHANGE", {
          connected: data.glasses_wifi_status_change.connected,
          ssid: data.glasses_wifi_status_change.ssid,
          local_ip: data.glasses_wifi_status_change.local_ip,
        })
      } else if ("glasses_display_event" in data) {
        GlobalEventEmitter.emit("GLASSES_DISPLAY_EVENT", data.glasses_display_event)
      } else if ("ping" in data) {
        // Heartbeat response - nothing to do
      } else if ("notify_manager" in data) {
        GlobalEventEmitter.emit("SHOW_BANNER", {
          message: translate(data.notify_manager.message),
          type: data.notify_manager.type,
        })
      } else if ("compatible_glasses_search_result" in data) {
        GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_RESULT", {
          modelName: data.compatible_glasses_search_result.model_name,
          deviceName: data.compatible_glasses_search_result.device_name,
        })
      } else if ("compatible_glasses_search_stop" in data) {
        GlobalEventEmitter.emit("COMPATIBLE_GLASSES_SEARCH_STOP", {
          modelName: data.compatible_glasses_search_stop.model_name,
        })
      } else if ("need_permissions" in data) {
        GlobalEventEmitter.emit("NEED_PERMISSIONS")
      } else if ("need_wifi_credentials" in data) {
        console.log("Received need_wifi_credentials event from Core")
        GlobalEventEmitter.emit("GLASSES_NEED_WIFI_CREDENTIALS", {
          deviceModel: data.device_model,
        })
      } else if ("wifi_scan_results" in data) {
        console.log("🔍 ========= WIFI SCAN RESULTS RECEIVED =========")
        console.log("🔍 Received WiFi scan results from Core:", data)
        console.log("🔍 Networks array:", data.wifi_scan_results)
        console.log("🔍 Networks count:", data.wifi_scan_results?.length || 0)
        GlobalEventEmitter.emit("WIFI_SCAN_RESULTS", {
          networks: data.wifi_scan_results,
        })
        console.log("🔍 Emitted WIFI_SCAN_RESULTS event to GlobalEventEmitter")
        console.log("🔍 ========= END WIFI SCAN RESULTS =========")
      }

      if (!("type" in data)) {
        return
      }
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
        case "pair_failure":
          GlobalEventEmitter.emit("PAIR_FAILURE", data.error)
          break
        default:
          console.log("Unknown event type:", data.type)
          break
      }
    } catch (e) {
      console.error("Error parsing data from Core:", e)
      this.emit("statusUpdateReceived", AugmentOSParser.defaultStatus)
    }
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
  private async sendData(dataObj: any) {
    try {
      if (INTENSE_LOGGING) {
        console.log("Sending data to Core:", JSON.stringify(dataObj))
      }

      if (Platform.OS === "android") {
        // Ensure the service is running
        if (!(await CoreCommsService.isServiceRunning())) {
          CoreCommsService.startService()
        }
        CoreCommsService.sendCommandToCore(JSON.stringify(dataObj))
      } else {
        AOSModule.sendCommand(JSON.stringify(dataObj))
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
    CoreCommunicator.instance = null

    console.log("CoreCommunicator cleaned up")
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

  async sendConnectWearable(modelName: string, deviceName: string = "") {
    return await this.sendData({
      command: "connect_wearable",
      params: {
        model_name: modelName,
        device_name: deviceName,
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

  async sendToggleVirtualWearable(enabled: boolean) {
    return await this.sendData({
      command: "enable_virtual_wearable",
      params: {
        enabled: enabled,
      },
    })
  }

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

  async restartTranscription(isMicCurrentlyEnabled: boolean = true) {
    if (!isMicCurrentlyEnabled) {
      console.log("Mic is not enabled, skipping transcription restart")
      return
    }

    console.log("Restarting transcription with new model...")

    // Toggle mic off
    await this.sendData({
      command: "toggle_mic",
      params: {
        enabled: false,
      },
    })

    // Wait for the change to take effect
    await new Promise(resolve => setTimeout(resolve, 500))

    // Toggle mic back on
    await this.sendData({
      command: "toggle_mic",
      params: {
        enabled: true,
      },
    })
  }

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

  async sendToggleContextualDashboard(enabled: boolean) {
    return await this.sendData({
      command: "enable_contextual_dashboard",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendToggleBypassVadForDebugging(enabled: boolean) {
    return await this.sendData({
      command: "bypass_vad_for_debugging",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendTogglePowerSavingMode(enabled: boolean) {
    return await this.sendData({
      command: "enable_power_saving_mode",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendToggleBypassAudioEncodingForDebugging(enabled: boolean) {
    return await this.sendData({
      command: "bypass_audio_encoding_for_debugging",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendToggleEnforceLocalTranscription(enabled: boolean) {
    return await this.sendData({
      command: "enforce_local_transcription",
      params: {
        enabled: enabled,
      },
    })
  }

  async sendToggleAlwaysOnStatusBar(enabled: boolean) {
    console.log("sendToggleAlwaysOnStatusBar")
    return await this.sendData({
      command: "enable_always_on_status_bar",
      params: {
        enabled: enabled,
      },
    })
  }

  async setGlassesBrightnessMode(brightness: number, autoBrightness: boolean) {
    return await this.sendData({
      command: "update_glasses_brightness",
      params: {
        brightness: brightness,
        autoBrightness: autoBrightness,
      },
    })
  }

  async setGlassesHeadUpAngle(headUpAngle: number) {
    return await this.sendData({
      command: "update_glasses_head_up_angle",
      params: {
        headUpAngle: headUpAngle,
      },
    })
  }

  async setGlassesHeight(height: number) {
    return await this.sendData({
      command: "update_glasses_height",
      params: {height: height},
    })
  }

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

  async setAuthenticationSecretKey(userId: string, authSecretKey: string) {
    return await this.sendData({
      command: "set_auth_secret_key",
      params: {
        userId: userId,
        authSecretKey: authSecretKey,
      },
    })
  }

  async setServerUrl(url: string) {
    return await this.sendData({
      command: "set_server_url",
      params: {
        url: url,
      },
    })
  }

  async verifyAuthenticationSecretKey() {
    return await this.sendData({
      command: "verify_auth_secret_key",
    })
  }

  async deleteAuthenticationSecretKey() {
    return await this.sendData({
      command: "delete_auth_secret_key",
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

  /**
   * Sends audio play response back to Core
   */
  private async sendAudioPlayResponse(response: AudioPlayResponse) {
    console.log(
      `CoreCommunicator: Sending audio play response for requestId: ${response.requestId}, success: ${response.success}`,
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
}

// Create and export the singleton instance
const coreCommunicator = CoreCommunicator.getInstance()
export default coreCommunicator
