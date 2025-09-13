protocol SGCManager {
    var type: String { get }
    var hasMic: Bool { get }
    var ready: Bool { get }
    var batteryLevel: Int { get }
    var isHeadUp: Bool { get }
    var caseOpen: Bool { get }
    var caseRemoved: Bool { get }
    var caseCharging: Bool { get }
    var caseBatteryLevel: Int? { get }
    var glassesAppVersion: String? { get }
    var glassesBuildNumber: String? { get }
    var glassesDeviceModel: String? { get }
    var glassesAndroidVersion: String? { get }
    var glassesOtaVersionUrl: String? { get }
    var glassesSerialNumber: String? { get }
    var glassesStyle: String? { get }
    var glassesColor: String? { get }
    var wifiSsid: String? { get }
    var wifiConnected: Bool? { get }
    var wifiLocalIp: String? { get }
    var isHotspotEnabled: Bool? { get }
    var hotspotSsid: String? { get }
    var hotspotPassword: String? { get }
    var hotspotGatewayIp: String? { get }

    // setMicEnabled:
    func setMicEnabled(_ enabled: Bool)

    // Message handlers
    func sendJson(_ jsonOriginal: [String: Any], wakeUp: Bool)
    func requestPhoto(_ requestId: String, appId: String, webhookUrl: String?, size: String?)
    func startRtmpStream(_ message: [String: Any])
    func stopRtmpStream()
    func sendRtmpKeepAlive(_ message: [String: Any])
    func startBufferRecording()
    func stopBufferRecording()
    func saveBufferVideo(requestId: String, durationSeconds: Int)
    func startVideoRecording(requestId: String, save: Bool)
    func stopVideoRecording(requestId: String)
    func sendButtonPhotoSettings()
    func sendButtonModeSetting()
    func sendButtonVideoRecordingSettings()
    func sendButtonCameraLedSetting()
    func setHeadUpAngle(_ angle: Int)

    func getBatteryStatus()
    func setBrightness(_ level: Int, autoMode: Bool)
    func clearDisplay()
    func sendTextWall(_ text: String)
    func sendDoubleTextWall(_ top: String, _ bottom: String)
    func disconnect()
    func forget()
    func displayBitmap(base64ImageData: String) async -> Bool
    func exit()
    func requestWifiScan()
    func sendWifiCredentials(_ ssid: String, _ password: String)
    func sendHotspotState(_ enabled: Bool)
    func queryGalleryStatus()
    func showDashboard()
    func getConnectedBluetoothName() -> String?
    func setDashboardPosition(_ height: Int, _ depth: Int)
    func setSilentMode(_ enabled: Bool)

    func findCompatibleDevices()
    func connectById(_ id: String)
}

//// template:
// var glassesBuildNumber = ""
// var glassesDeviceModel = ""
// var glassesAndroidVersion = ""
// var glassesOtaVersionUrl = ""
// var glassesSerialNumber = ""
// var glassesStyle = ""
// var glassesColor = ""
// var caseBatteryLevel = 0
// var glassesAppVersion = ""
//
//// Data Properties
// @Published var batteryLevel: Int = -1
// @Published var isCharging: Bool = false
// @Published var wifiConnected: Bool = false
// @Published var wifiSsid: String = ""
// @Published var wifiLocalIp: String = ""
// @Published var isHotspotEnabled: Bool = false
// @Published var hotspotSsid: String = ""
// @Published var hotspotPassword: String = ""
// @Published var hotspotGatewayIp: String = "" // The gateway IP to connect to when on hotspot
