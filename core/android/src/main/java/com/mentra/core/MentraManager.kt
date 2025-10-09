package com.mentra.core

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.mentra.core.services.ForegroundService
import com.mentra.core.services.PhoneMic
import com.mentra.core.sgcs.G1
import com.mentra.core.sgcs.MentraLive
import com.mentra.core.sgcs.SGCManager
import com.mentra.core.sgcs.Simulated
import com.mentra.core.stt.SherpaOnnxTranscriber
import com.mentra.core.stt.VadGateSpeechPolicy
import com.mentra.core.utils.DeviceTypes
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class MentraManager {
    companion object {

        @Volatile private var instance: MentraManager? = null

        @JvmStatic
        fun getInstance(): MentraManager {
            return instance
                    ?: synchronized(this) { instance ?: MentraManager().also { instance = it } }
        }
    }

    // MARK: - Unique (Android)
    private var serviceStarted = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private var sendStateWorkItem: Runnable? = null
    // Track last known permissions
    private var lastHadBluetoothPermission = false
    private var lastHadMicrophonePermission = false
    private var permissionReceiver: BroadcastReceiver? = null
    private val handler = Handler(Looper.getMainLooper())
    private var permissionCheckRunnable: Runnable? = null
    // MARK: - End Unique

    // MARK: - Properties
    var coreToken = ""
    var coreTokenOwner = ""
    var sgc: SGCManager? = null

    // state
    private var shouldSendBootingMessage = true
    private val lastStatusObj = ConcurrentHashMap<String, Any>()
    private var defaultWearable = ""
    private var pendingWearable = ""
    public var deviceName = ""
    public var deviceAddress = ""
    private var isUpdatingScreen = false
    private var isSearching = false
    private var onboardMicUnavailable = false
    public val currentRequiredData = mutableListOf<String>()

    // glasses settings
    private var contextualDashboard = true
    private var headUpAngle = 30
    public var brightness = 50
    public var autoBrightness = true
    public var dashboardHeight = 4
    public var dashboardDepth = 5

    // glasses state
    private var isHeadUp = false

    // settings
    public var sensingEnabled = true
    public var powerSavingMode = false
    private var alwaysOnStatusBar = false
    private var bypassVad = true
    private var bypassVadForPCM = false
    private var enforceLocalTranscription = false
    private var bypassAudioEncoding = false
    private var offlineMode = false
    private var metricSystem = false

    // mic
    public var useOnboardMic = false
    public var preferredMic = "glasses"
    public var micEnabled = false

    // button settings
    public var buttonPressMode = "photo"
    public var buttonPhotoSize = "medium"
    public var buttonVideoWidth = 1280
    public var buttonVideoHeight = 720
    public var buttonVideoFps = 30
    public var buttonMaxRecordingTime = 10
    public var buttonCameraLed = true

    // VAD
    private val vadBuffer = mutableListOf<ByteArray>()
    private var isSpeaking = false

    // STT
    private var shouldSendPcmData = false
    private var shouldSendTranscript = false
    private var vad: VadGateSpeechPolicy? = null
    private var transcriber: SherpaOnnxTranscriber? = null

    // View states
    private val viewStates = mutableListOf<ViewState>()

    init {
        Bridge.log("Mentra: init()")
        initializeViewStates()
        startForegroundService()
        setupVad()
        setupTranscriber()
        // setupPermissionMonitoring()
    }

    // MARK: - STT/VAD Setup

    /**
     * Initialize the VAD (Voice Activity Detection) system
     * Matches iOS MentraManager.swift:126
     */
    private fun setupVad() {
        val context = Bridge.getContext() ?: run {
            Bridge.log("Failed to setup VAD - no context available")
            return
        }

        try {
            vad = VadGateSpeechPolicy(context).apply {
                init(512) // 512 samples per frame (matches Sherpa-ONNX requirements)
            }
            Bridge.log("VAD initialized successfully")
        } catch (e: Exception) {
            Bridge.log("Failed to initialize VAD: ${e.message}")
            vad = null
        }
    }

    /**
     * Initialize the Sherpa-ONNX transcriber for local speech-to-text
     * Matches iOS MentraManager.swift:130-143
     */
    private fun setupTranscriber() {
        val context = Bridge.getContext() ?: run {
            Bridge.log("Failed to setup transcriber - no context available")
            return
        }

        try {
            transcriber = SherpaOnnxTranscriber(context).apply {
                setTranscriptListener(object : SherpaOnnxTranscriber.TranscriptListener {
                    override fun onPartialResult(text: String, language: String) {
                        sendFormattedTranscription(text, isFinal = false, language)
                    }

                    override fun onFinalResult(text: String, language: String) {
                        sendFormattedTranscription(text, isFinal = true, language)
                    }
                })

                // Initialize on background thread
                Thread {
                    try {
                        initialize()
                        Bridge.log("SherpaOnnxTranscriber fully initialized")
                    } catch (e: Exception) {
                        Bridge.log("Failed to initialize SherpaOnnxTranscriber: ${e.message}")
                    }
                }.start()
            }
        } catch (e: Exception) {
            Bridge.log("Failed to setup transcriber: ${e.message}")
            transcriber = null
        }
    }

    /**
     * Format and send transcription results to the backend
     * Matches iOS STTTools.swift didReceivePartialTranscription/didReceiveFinalTranscription
     */
    private fun sendFormattedTranscription(text: String, isFinal: Boolean, language: String) {
        try {
            // Process text if language is en-US to lowercase (matches iOS behavior)
            val processedText = if (language == "en-US") text.lowercase() else text

            val transcription = mapOf(
                "type" to "local_transcription",
                "text" to processedText,
                "isFinal" to isFinal,
                "startTime" to (System.currentTimeMillis() - if (isFinal) 2000 else 1000),
                "endTime" to System.currentTimeMillis(),
                "speakerId" to 0,
                "transcribeLanguage" to language,
                "provider" to "sherpa-onnx"
            )

            Bridge.sendLocalTranscription(transcription)
            Bridge.log("Sent ${if (isFinal) "final" else "partial"} transcription: $text")
        } catch (e: Exception) {
            Bridge.log("Error sending transcription: ${e.message}")
        }
    }

    // MARK: - Unique (Android)
    private fun setupPermissionMonitoring() {
        val context = Bridge.getContext()

        // Store initial permission state
        lastHadBluetoothPermission = checkBluetoothPermission(context)
        lastHadMicrophonePermission = checkMicrophonePermission(context)

        Bridge.log(
                "Mentra: Initial permissions - BT: $lastHadBluetoothPermission, Mic: $lastHadMicrophonePermission"
        )

        // Create receiver for package changes (fires when permissions change)
        permissionReceiver =
                object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        if (intent?.action == Intent.ACTION_PACKAGE_CHANGED &&
                                        intent.data?.schemeSpecificPart == context?.packageName
                        ) {

                            Bridge.log("Mentra: Package changed, checking permissions...")
                            checkPermissionChanges()
                        }
                    }
                }

        // Register the receiver
        try {
            val filter =
                    IntentFilter().apply {
                        addAction(Intent.ACTION_PACKAGE_CHANGED)
                        addDataScheme("package")
                    }
            context.registerReceiver(permissionReceiver, filter)
            Bridge.log("Mentra: Permission monitoring started")
        } catch (e: Exception) {
            Bridge.log("Mentra: Failed to register permission receiver: ${e.message}")
        }

        // Also set up a periodic check as backup (some devices don't fire PACKAGE_CHANGED reliably)
        // startPeriodicPermissionCheck()
    }

    private fun startPeriodicPermissionCheck() {
        permissionCheckRunnable =
                object : Runnable {
                    override fun run() {
                        checkPermissionChanges()
                        handler.postDelayed(this, 10000) // Check every 10 seconds
                    }
                }
        handler.postDelayed(permissionCheckRunnable!!, 10000)
    }

    private fun checkPermissionChanges() {
        val context = Bridge.getContext()

        val currentHasBluetoothPermission = checkBluetoothPermission(context)
        val currentHasMicrophonePermission = checkMicrophonePermission(context)

        var permissionsChanged = false

        if (currentHasBluetoothPermission != lastHadBluetoothPermission) {
            Bridge.log(
                    "Mentra: Bluetooth permission changed: $lastHadBluetoothPermission -> $currentHasBluetoothPermission"
            )
            lastHadBluetoothPermission = currentHasBluetoothPermission
            permissionsChanged = true
        }

        if (currentHasMicrophonePermission != lastHadMicrophonePermission) {
            Bridge.log(
                    "Mentra: Microphone permission changed: $lastHadMicrophonePermission -> $currentHasMicrophonePermission"
            )
            lastHadMicrophonePermission = currentHasMicrophonePermission
            permissionsChanged = true
        }

        if (permissionsChanged && serviceStarted) {
            Bridge.log("Mentra: Permissions changed, restarting service")
            restartForegroundService()
        }
    }

    private fun checkBluetoothPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                    context,
                    android.Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.BLUETOOTH) ==
                    PackageManager.PERMISSION_GRANTED
        }
    }

    private fun checkMicrophonePermission(context: Context): Boolean {
        return ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun startForegroundService() {
        val context = Bridge.getContext()

        try {
            Bridge.log("Mentra: Starting foreground service")
            val serviceIntent = Intent(context, ForegroundService::class.java)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }

            serviceStarted = true
            Bridge.log("Mentra: Foreground service started")
        } catch (e: Exception) {
            Bridge.log("Mentra: Failed to start service: ${e.message}")
        }
    }

    private fun restartForegroundService() {
        val context = Bridge.getContext()

        try {
            // Stop the service
            val stopIntent = Intent(context, ForegroundService::class.java)
            context.stopService(stopIntent)

            // Small delay
            Thread.sleep(100)

            // Start it again with new permissions
            val startIntent = Intent(context, ForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(startIntent)
            } else {
                context.startService(startIntent)
            }

            Bridge.log("Mentra: Service restarted with updated permissions")
        } catch (e: Exception) {
            Bridge.log("Mentra: Failed to restart service: ${e.message}")
        }
    }

    private fun initializeViewStates() {
        viewStates.clear()

        // Matching Swift's 4 view states exactly
        viewStates.add(ViewState(" ", " ", " ", "text_wall", "", null, null))
        viewStates.add(
                ViewState(
                        " ",
                        " ",
                        " ",
                        "text_wall",
                        "\$TIME12$ \$DATE$ \$GBATT$ \$CONNECTION_STATUS$",
                        null,
                        null
                )
        )
        viewStates.add(ViewState(" ", " ", " ", "text_wall", "", null, null))
        viewStates.add(
                ViewState(
                        " ",
                        " ",
                        " ",
                        "text_wall",
                        "\$TIME12$ \$DATE$ \$GBATT$ \$CONNECTION_STATUS$",
                        null,
                        null
                )
        )
    }

    private fun statesEqual(s1: ViewState, s2: ViewState): Boolean {
        val state1 =
                "${s1.layoutType}${s1.text}${s1.topText}${s1.bottomText}${s1.title}${s1.data ?: ""}"
        val state2 =
                "${s2.layoutType}${s2.text}${s2.topText}${s2.bottomText}${s2.title}${s2.data ?: ""}"
        return state1 == state2
    }

    private fun Map<String, Any>.getString(key: String, defaultValue: String): String {
        return (this[key] as? String) ?: defaultValue
    }

    // Inner classes

    data class ViewState(
            var topText: String,
            var bottomText: String,
            var title: String,
            var layoutType: String,
            var text: String,
            var data: String?,
            var animationData: Map<String, Any>?
    )

    enum class SpeechRequiredDataType {
        PCM,
        TRANSCRIPTION,
        PCM_OR_TRANSCRIPTION
    }
    // MARK: - End Unique

    // MARK: - Voice Data Handling

    private fun checkSetVadStatus(speaking: Boolean) {
        if (speaking != isSpeaking) {
            isSpeaking = speaking
            Bridge.sendVadStatus(isSpeaking)
        }
    }

    private fun emptyVadBuffer() {
        while (vadBuffer.isNotEmpty()) {
            val chunk = vadBuffer.removeAt(0)
            Bridge.sendMicData(chunk)
        }
    }

    private fun addToVadBuffer(chunk: ByteArray) {
        val MAX_BUFFER_SIZE = 20
        vadBuffer.add(chunk)
        while (vadBuffer.size > MAX_BUFFER_SIZE) {
            vadBuffer.removeAt(0)
        }
    }

    fun handleGlassesMicData(rawLC3Data: ByteArray) {
        // decode the lc3 data to pcm and pass to the bridge to be sent to the server:
        // TODO: config
    }

    /**
     * Handle incoming PCM audio data from the microphone
     * Feeds audio through VAD and transcriber pipelines
     * Matches iOS MentraManager.swift:257-324
     */
    fun handlePcm(pcmData: ByteArray) {
        // Check if VAD should be bypassed
        if (bypassVad || bypassVadForPCM) {
            // Bypass VAD - send directly to server and transcriber
            if (shouldSendPcmData) {
                Bridge.sendMicData(pcmData)
            }

            // Also send to local transcriber when bypassing VAD
            if (shouldSendTranscript) {
                transcriber?.acceptAudio(pcmData)
            }
            return
        }

        // Feed PCM to the VAD
        val currentVad = vad
        if (currentVad == null) {
            // VAD not initialized - fall back to bypass mode
            if (shouldSendPcmData) {
                Bridge.sendMicData(pcmData)
            }
            if (shouldSendTranscript) {
                transcriber?.acceptAudio(pcmData)
            }
            return
        }

        // Process audio through VAD
        currentVad.processAudioBytes(pcmData, 0, pcmData.size)

        // Check VAD state
        val shouldPassAudio = currentVad.shouldPassAudioToRecognizer()

        if (shouldPassAudio) {
            // Speech detected
            checkSetVadStatus(true)

            // First send out whatever's in the vadBuffer (if there is anything)
            emptyVadBuffer()

            // Send current audio
            if (shouldSendPcmData) {
                Bridge.sendMicData(pcmData)
            }

            // Send to local transcriber when speech is detected
            if (shouldSendTranscript) {
                transcriber?.acceptAudio(pcmData)
            }
        } else {
            // No speech - buffer the audio
            checkSetVadStatus(false)
            addToVadBuffer(pcmData)
        }
    }

    private fun updateMicrophoneState() {
        val actuallyEnabled = micEnabled && sensingEnabled
        val glassesHasMic = sgc?.hasMic ?: false

        var useGlassesMic = preferredMic == "glasses"
        var useOnboardMic = preferredMic == "phone"

        if (onboardMicUnavailable) {
            useOnboardMic = false
        }

        if (!glassesHasMic) {
            useGlassesMic = false
        }

        if (!useGlassesMic && !useOnboardMic) {
            if (glassesHasMic) {
                useGlassesMic = true
            } else if (!onboardMicUnavailable) {
                useOnboardMic = true
            }

            if (!useGlassesMic && !useOnboardMic) {
                Bridge.log("Mentra: no mic to use! falling back to glasses mic!")
                useGlassesMic = true
            }
        }

        useGlassesMic = actuallyEnabled && useGlassesMic
        useOnboardMic = actuallyEnabled && useOnboardMic

        sgc?.let { sgc ->
            if (sgc.type == DeviceTypes.G1 && sgc.ready) {
                sgc.setMicEnabled(useGlassesMic)
            }
        }

        setOnboardMicEnabled(useOnboardMic)
    }

    private fun setOnboardMicEnabled(enabled: Boolean) {
        Bridge.log("Mentra: setOnboardMicEnabled(): $enabled")
        if (enabled) {
            PhoneMic.getInstance(Bridge.getContext()).startRecording()
        } else {
            PhoneMic.getInstance(Bridge.getContext()).stopRecording()
        }
    }

    private fun sendCurrentState(isDashboard: Boolean) {
        Bridge.log("Mentra: sendCurrentState(): $isDashboard")
        if (isUpdatingScreen) {
            return
        }

        // executor.execute {
        val currentViewState =
                if (isDashboard) {
                    viewStates[1]
                } else {
                    viewStates[0]
                }

        isHeadUp = isDashboard

        if (isDashboard && !contextualDashboard) {
            return
        }

        if (sgc?.type?.contains(DeviceTypes.SIMULATED) == true) {
            // dont send the event to glasses that aren't there:
            return
        }

        var ready = sgc?.ready ?: false
        if (!ready) {
            return
        }

        // Cancel any pending clear display work item
        // sendStateWorkItem?.let { mainHandler.removeCallbacks(it) }
        //
        Bridge.log("Mentra: Entering parseViewState")

        when (currentViewState.layoutType) {
            "text_wall" -> sendText(currentViewState.text)
            "double_text_wall" -> {
                sgc?.sendDoubleTextWall(currentViewState.topText, currentViewState.bottomText)
            }
            "reference_card" -> {
                sendText("${currentViewState.title}\n\n${currentViewState.text}")
            }
            "bitmap_view" -> {
                currentViewState.data?.let { data -> sgc?.displayBitmap(data) }
            }
            "clear_view" -> clearDisplay()
            else -> Bridge.log("Mentra: UNHANDLED LAYOUT_TYPE ${currentViewState.layoutType}")
        }
        // }
    }

    private fun parsePlaceholders(text: String): String {
        val dateFormatter = SimpleDateFormat("M/dd, h:mm", Locale.getDefault())
        val formattedDate = dateFormatter.format(Date())

        val time12Format = SimpleDateFormat("hh:mm", Locale.getDefault())
        val time12 = time12Format.format(Date())

        val time24Format = SimpleDateFormat("HH:mm", Locale.getDefault())
        val time24 = time24Format.format(Date())

        val dateFormat = SimpleDateFormat("MM/dd", Locale.getDefault())
        val currentDate = dateFormat.format(Date())

        val placeholders =
                mapOf(
                        "\$no_datetime$" to formattedDate,
                        "\$DATE$" to currentDate,
                        "\$TIME12$" to time12,
                        "\$TIME24$" to time24,
                        "\$GBATT$" to
                                (sgc?.batteryLevel?.let { if (it == -1) "" else "$it%" } ?: ""),
                        "\$CONNECTION_STATUS$" to "Connected"
                )

        return placeholders.entries.fold(text) { result, (key, value) ->
            result.replace(key, value)
        }
    }

    fun onRouteChange(reason: String, availableInputs: List<String>) {
        Bridge.log("Mentra: onRouteChange: reason: $reason")
        Bridge.log("Mentra: onRouteChange: inputs: $availableInputs")
    }

    fun onInterruption(began: Boolean) {
        Bridge.log("Mentra: Interruption: $began")
        onboardMicUnavailable = began
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    // MARK: - State Management

    fun updateHeadUp(headUp: Boolean) {
        isHeadUp = headUp
        sendCurrentState(isHeadUp)
        Bridge.sendHeadUp(isHeadUp)
    }

    fun updateContextualDashboard(enabled: Boolean) {
        contextualDashboard = enabled
        handle_request_status()
    }

    fun updatePreferredMic(mic: String) {
        preferredMic = mic
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handle_request_status()
    }

    fun updateButtonMode(mode: String) {
        buttonPressMode = mode
        sgc?.sendButtonModeSetting()
        handle_request_status()
    }

    fun updateButtonPhotoSize(size: String) {
        buttonPhotoSize = size
        sgc?.sendButtonPhotoSettings()
        handle_request_status()
    }

    fun updateButtonVideoSettings(width: Int, height: Int, fps: Int) {
        buttonVideoWidth = width
        buttonVideoHeight = height
        buttonVideoFps = fps
        sgc?.sendButtonVideoRecordingSettings()
        handle_request_status()
    }

    fun updateButtonCameraLed(enabled: Boolean) {
        buttonCameraLed = enabled
        sgc?.sendButtonCameraLedSetting()
        handle_request_status()
    }

    fun updateButtonMaxRecordingTime(minutes: Int) {
        buttonMaxRecordingTime = minutes
        sgc?.sendButtonMaxRecordingTime()
        handle_request_status()
    }

    fun updateGlassesHeadUpAngle(value: Int) {
        headUpAngle = value
        sgc?.setHeadUpAngle(value)
        handle_request_status()
    }

    fun updateGlassesBrightness(value: Int, autoMode: Boolean) {
        val autoBrightnessChanged = this.autoBrightness != autoMode
        brightness = value
        this.autoBrightness = autoMode

        executor.execute {
            sgc?.setBrightness(value, autoMode)
            if (autoBrightnessChanged) {
                sendText(if (autoMode) "Enabled auto brightness" else "Disabled auto brightness")
            } else {
                sendText("Set brightness to $value%")
            }
            try {
                Thread.sleep(800)
            } catch (e: InterruptedException) {
                // Ignore
            }
            sendText(" ")
        }

        handle_request_status()
    }

    fun updateGlassesDepth(value: Int) {
        dashboardDepth = value
        sgc?.let {
            it.setDashboardPosition(dashboardHeight, dashboardDepth)
            Bridge.log("Mentra: Set dashboard depth to $value")
        }
        handle_request_status()
    }

    fun updateGlassesHeight(value: Int) {
        dashboardHeight = value
        sgc?.let {
            it.setDashboardPosition(dashboardHeight, dashboardDepth)
            Bridge.log("Mentra: Set dashboard height to $value")
        }
        handle_request_status()
    }

    fun updateSensing(enabled: Boolean) {
        sensingEnabled = enabled
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
        handle_request_status()
    }

    fun updatePowerSavingMode(enabled: Boolean) {
        powerSavingMode = enabled
        handle_request_status()
    }

    fun updateAlwaysOnStatusBar(enabled: Boolean) {
        alwaysOnStatusBar = enabled
        handle_request_status()
    }

    fun updateBypassVad(enabled: Boolean) {
        bypassVad = enabled
        vad?.changeBypassVadForDebugging(enabled)
        handle_request_status()
    }

    fun updateEnforceLocalTranscription(enabled: Boolean) {
        enforceLocalTranscription = enabled

        if (currentRequiredData.contains("PCM_OR_TRANSCRIPTION")) {
            if (enforceLocalTranscription) {
                shouldSendTranscript = true
                shouldSendPcmData = false
            } else {
                shouldSendPcmData = true
                shouldSendTranscript = false
            }
        }

        handle_request_status()
    }

    fun updateOfflineMode(enabled: Boolean) {
        offlineMode = enabled
        handle_microphone_state_change(currentRequiredData, bypassVadForPCM)
    }

    fun updateBypassAudioEncoding(enabled: Boolean) {
        bypassAudioEncoding = enabled
    }

    fun updateMetricSystem(enabled: Boolean) {
        metricSystem = enabled
        handle_request_status()
    }

    fun updateUpdatingScreen(enabled: Boolean) {
        Bridge.log("Mentra: Toggling updating screen: $enabled")
        if (enabled) {
            sgc?.exit()
            isUpdatingScreen = true
        } else {
            isUpdatingScreen = false
        }
    }

    // MARK: - Glasses Commands

    // send whatever was there before sending something else:
    fun clearState() {
        sendCurrentState(isHeadUp)
    }

    private fun clearDisplay() {
        sgc?.let { sgc ->
            sgc.sendTextWall(" ")

            if (powerSavingMode) {
                sendStateWorkItem?.let { mainHandler.removeCallbacks(it) }

                Bridge.log("Mentra: Clearing display after 3 seconds")
                sendStateWorkItem = Runnable {
                    if (isHeadUp) {
                        return@Runnable
                    }
                    sgc.clearDisplay()
                }
                mainHandler.postDelayed(sendStateWorkItem!!, 3000)
            }
        }
    }

    private fun sendText(text: String) {
        Bridge.log("Mentra: sendText: $text")
        val currentSgc = sgc ?: return

        if (text == " " || text.isEmpty()) {
            clearDisplay()
            return
        }

        val parsed = parsePlaceholders(text)
        currentSgc.sendTextWall(parsed)
    }

    // MARK: - Auxiliary Commands

    fun initSGC(wearable: String) {
        Bridge.log("Initializing manager for wearable: $wearable")
        if (sgc != null) {
            Bridge.log("Mentra: Manager already initialized, cleaning up previous sgc")
            sgc?.cleanup()
            sgc = null
        }

        if (wearable.contains(DeviceTypes.SIMULATED)) {
            sgc = Simulated()
        } else if (wearable.contains(DeviceTypes.G1)) {
            sgc = G1()
        } else if (wearable.contains(DeviceTypes.LIVE)) {
            sgc = MentraLive()
        } else if (wearable.contains(DeviceTypes.MACH1)) {
            // sgc = Mach1()
        } else if (wearable.contains(DeviceTypes.FRAME)) {
            // sgc = FrameManager()
        }
    }

    /**
     * Restart the transcriber after model changes
     * Matches iOS MentraManager.swift:778-781
     */
    fun restartTranscriber() {
        Bridge.log("Mentra: Restarting SherpaOnnxTranscriber via command")

        // Restart transcriber on background thread to avoid blocking
        Thread {
            try {
                transcriber?.restart()
                Bridge.log("Transcriber restarted successfully")
            } catch (e: Exception) {
                Bridge.log("Error restarting transcriber: ${e.message}")
            }
        }.start()
    }

    // MARK: - connection state management

    fun handleConnectionStateChanged() {
        Bridge.log("Mentra: Glasses connection state changed!")

        val currentSgc = sgc ?: return

        if (currentSgc.ready) {
            handleDeviceReady()
        } else {
            handleDeviceDisconnected()
            handle_request_status()
        }
    }

    private fun handleDeviceReady() {
        if (sgc == null) {
            Bridge.log("Mentra: SGC is null, returning")
            return
        }

        Bridge.log("Mentra: handleDeviceReady() ${sgc?.type}")
        pendingWearable = ""
        defaultWearable = sgc?.type ?: ""

        // TODO: fix this hack!
        if (sgc is G1) {
            defaultWearable = DeviceTypes.G1
            handle_request_status()
            handleG1Ready()
        }

        if (sgc is MentraLive) {
            defaultWearable = DeviceTypes.LIVE
            handle_request_status()
        }

        isSearching = false
        handle_request_status()

        if (defaultWearable.contains(DeviceTypes.G1)) {
            handleG1Ready()
        } else if (defaultWearable.contains(DeviceTypes.MACH1)) {
            handleMach1Ready()
        }

        // save the default_wearable now that we're connected:
        Bridge.saveSetting("default_wearable", defaultWearable)
        Bridge.saveSetting("device_name", deviceName)
    }

    private fun handleG1Ready() {
        // load settings and send the animation:
        // give the glasses some extra time to finish booting:
        // Thread.sleep(1000)
        // await sgc?.setSilentMode(false) // turn off silent mode
        // await sgc?.getBatteryStatus()

        // if shouldSendBootingMessage {
        //     sendText("// BOOTING MENTRAOS")
        // }

        // // send loaded settings to glasses:
        // try? await Task.sleep(nanoseconds: 400_000_000)
        // sgc?.setHeadUpAngle(headUpAngle)
        // try? await Task.sleep(nanoseconds: 400_000_000)
        // sgc?.setBrightness(brightness, autoMode: autoBrightness)
        // try? await Task.sleep(nanoseconds: 400_000_000)
        // // self.g1Manager?.RN_setDashboardPosition(self.dashboardHeight, self.dashboardDepth)
        // // try? await Task.sleep(nanoseconds: 400_000_000)
        // //      playStartupSequence()
        // if shouldSendBootingMessage {
        //     sendText("// MENTRAOS CONNECTED")
        //     try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second
        //     sendText(" ") // clear screen
        // }

        // shouldSendBootingMessage = false

        // handle_request_status()
    }

    private fun handleMach1Ready() {
        // Send startup message
        sendText("MENTRAOS CONNECTED")
        Thread.sleep(1000)
        clearDisplay()

        handle_request_status()
    }

    private fun handleDeviceDisconnected() {
        Bridge.log("Mentra: Device disconnected")
        isHeadUp = false
        handle_request_status()
    }

    // MARK: - Network Command handlers

    fun handle_display_text(params: Map<String, Any>) {
        (params["text"] as? String)?.let { text ->
            Bridge.log("Mentra: Displaying text: $text")
            sendText(text)
        }
    }

    fun handle_display_event(event: Map<String, Any>) {
        val view = event["view"] as? String
        if (view == null) {
            Bridge.log("Mentra: Invalid view")
            return
        }

        val isDashboard = view == "dashboard"
        val stateIndex = if (isDashboard) 1 else 0

        @Suppress("UNCHECKED_CAST") val layout = event["layout"] as? Map<String, Any> ?: return

        val layoutType = layout["layoutType"] as? String
        val text = parsePlaceholders(layout.getString("text", " "))
        val topText = parsePlaceholders(layout.getString("topText", " "))
        val bottomText = parsePlaceholders(layout.getString("bottomText", " "))
        val title = parsePlaceholders(layout.getString("title", " "))
        val data = layout["data"] as? String

        var newViewState = ViewState(topText, bottomText, title, layoutType ?: "", text, data, null)

        val currentState = viewStates[stateIndex]

        if (!statesEqual(currentState, newViewState)) {
            Bridge.log("Mentra: Updating view state $stateIndex with $layoutType")
            viewStates[stateIndex] = newViewState

            val headUp = isHeadUp
            if (stateIndex == 0 && !headUp) {
                sendCurrentState(false)
            } else if (stateIndex == 1 && headUp) {
                sendCurrentState(true)
            }
        }
    }

    fun handle_show_dashboard() {
        sgc?.showDashboard()
    }

    fun handle_send_rtmp_stream_start(message: MutableMap<String, Any>) {
        Bridge.log("Mentra: startRtmpStream")
        sgc?.startRtmpStream(message)
    }

    fun handle_stop_rtmp_stream() {
        Bridge.log("Mentra: stopRtmpStream")
        sgc?.stopRtmpStream()
    }

    fun handle_keep_rtmp_stream_alive(message: MutableMap<String, Any>) {
        Bridge.log("Mentra: keepRtmpStreamAlive: (message)")
        sgc?.sendRtmpKeepAlive(message)
    }

    fun handle_request_wifi_scan() {
        Bridge.log("Mentra: Requesting wifi scan")
        sgc?.requestWifiScan()
    }

    fun handle_send_wifi_credentials(ssid: String, password: String) {
        Bridge.log("Mentra: Sending wifi credentials: $ssid")
        sgc?.sendWifiCredentials(ssid, password)
    }

    fun handle_set_hotspot_state(enabled: Boolean) {
        Bridge.log("Mentra: Setting glasses hotspot state: $enabled")
        sgc?.sendHotspotState(enabled)
    }

    fun handle_query_gallery_status() {
        Bridge.log("Mentra: Querying gallery status from glasses")
        sgc?.queryGalleryStatus()
    }

    fun handle_start_buffer_recording() {
        Bridge.log("Mentra: onStartBufferRecording")
        sgc?.startBufferRecording()
    }

    fun handle_stop_buffer_recording() {
        Bridge.log("Mentra: onStopBufferRecording")
        sgc?.stopBufferRecording()
    }

    fun handle_save_buffer_video(requestId: String, durationSeconds: Int) {
        Bridge.log("Mentra: onSaveBufferVideo: requestId=$requestId, duration=$durationSeconds")
        sgc?.saveBufferVideo(requestId, durationSeconds)
    }

    fun handle_start_video_recording(requestId: String, save: Boolean) {
        Bridge.log("Mentra: onStartVideoRecording: requestId=$requestId, save=$save")
        sgc?.startVideoRecording(requestId, save)
    }

    fun handle_stop_video_recording(requestId: String) {
        Bridge.log("Mentra: onStopVideoRecording: requestId=$requestId")
        sgc?.stopVideoRecording(requestId)
    }

    fun handle_microphone_state_change(requiredData: List<String>, bypassVad: Boolean) {
        Bridge.log(
                "Mentra: MIC: changing mic with requiredData: $requiredData bypassVad=$bypassVad"
        )

        bypassVadForPCM = bypassVad

        currentRequiredData.clear()
        currentRequiredData.addAll(requiredData)

        val mutableRequiredData = requiredData.toMutableList()
        if (offlineMode &&
                        !mutableRequiredData.contains("PCM_OR_TRANSCRIPTION") &&
                        !mutableRequiredData.contains("TRANSCRIPTION")
        ) {
            mutableRequiredData.add("TRANSCRIPTION")
        }

        shouldSendPcmData = false
        shouldSendTranscript = false

        when {
            mutableRequiredData.contains("PCM") &&
                    mutableRequiredData.contains("TRANSCRIPTION") -> {
                shouldSendPcmData = true
                shouldSendTranscript = true
            }
            mutableRequiredData.contains("PCM") -> {
                shouldSendPcmData = true
                shouldSendTranscript = false
            }
            mutableRequiredData.contains("TRANSCRIPTION") -> {
                shouldSendTranscript = true
                shouldSendPcmData = false
            }
            mutableRequiredData.contains("PCM_OR_TRANSCRIPTION") -> {
                if (enforceLocalTranscription) {
                    shouldSendTranscript = true
                    shouldSendPcmData = false
                } else {
                    shouldSendPcmData = true
                    shouldSendTranscript = false
                }
            }
        }

        vadBuffer.clear()
        micEnabled = requiredData.isNotEmpty()

        // Propagate microphone state to VAD and transcriber
        vad?.changeBypassVadForPCM(bypassVad)
        vad?.microphoneStateChanged(micEnabled)
        transcriber?.microphoneStateChanged(micEnabled)

        updateMicrophoneState()
    }

    fun handle_photo_request(
            requestId: String,
            appId: String,
            size: String,
            webhookUrl: String,
            authToken: String
    ) {
        Bridge.log("Mentra: onPhotoRequest: $requestId, $appId, $size")
        sgc?.requestPhoto(requestId, appId, size, webhookUrl, authToken)
    }

    fun handle_connect_default() {
        if (defaultWearable.isEmpty()) {
            Bridge.log("Mentra: No default wearable, returning")
            return
        }
        if (deviceName.isEmpty()) {
            Bridge.log("Mentra: No device name, returning")
            return
        }
        initSGC(defaultWearable)
        isSearching = true
        handle_request_status()
        sgc?.connectById(deviceName)
    }

    fun handle_connect_by_name(dName: String) {
        Bridge.log("Mentra: Connecting to wearable: $dName")

        if (pendingWearable.isEmpty() && defaultWearable.isEmpty()) {
            Bridge.log("Mentra: No pending or default wearable, returning")
            return
        }

        if (pendingWearable.isEmpty() && !defaultWearable.isEmpty()) {
            Bridge.log("Mentra: No pending wearable, using default wearable")
            pendingWearable = defaultWearable
        }

        handle_disconnect()
        Thread.sleep(100)
        isSearching = true
        deviceName = dName

        initSGC(pendingWearable)
        sgc?.connectById(deviceName)
        handle_request_status()
    }

    fun handle_disconnect() {
        sendText(" ")
        sgc?.disconnect()
        isSearching = false
        handle_request_status()
    }

    fun handle_forget() {
        Bridge.log("Mentra: Forgetting smart glasses")
        handle_disconnect()
        defaultWearable = ""
        deviceName = ""
        sgc?.forget()
        sgc = null
        Bridge.saveSetting("default_wearable", "")
        Bridge.saveSetting("device_name", "")
        handle_request_status()
    }

    fun handle_find_compatible_devices(modelName: String) {
        Bridge.log("Mentra: Searching for compatible device names for: $modelName")

        if (DeviceTypes.ALL.contains(modelName)) {
            pendingWearable = modelName
        }

        initSGC(pendingWearable)
        Bridge.log("Mentra: sgc initialized, calling findCompatibleDevices")
        sgc?.findCompatibleDevices()
        handle_request_status()
    }

    fun handle_request_status() {
        val simulatedConnected = defaultWearable == DeviceTypes.SIMULATED
        val isGlassesConnected = sgc?.ready ?: false

        if (isGlassesConnected) {
            isSearching = false
        }

        val glassesSettings = mutableMapOf<String, Any>()
        val connectedGlasses = mutableMapOf<String, Any>()

        if (isGlassesConnected) {
            sgc?.let { sgc ->
                connectedGlasses["model_name"] = defaultWearable
                connectedGlasses["battery_level"] = sgc.batteryLevel
                connectedGlasses["glasses_app_version"] = sgc.glassesAppVersion
                connectedGlasses["glasses_build_number"] = sgc.glassesBuildNumber
                connectedGlasses["glasses_device_model"] = sgc.glassesDeviceModel
                connectedGlasses["glasses_android_version"] = sgc.glassesAndroidVersion
                connectedGlasses["glasses_ota_version_url"] = sgc.glassesOtaVersionUrl
            }
        }

        if (simulatedConnected) {
            connectedGlasses["model_name"] = defaultWearable
        }

        if (sgc is G1) {
            connectedGlasses["case_removed"] = sgc!!.caseRemoved
            connectedGlasses["case_open"] = sgc!!.caseOpen
            connectedGlasses["case_charging"] = sgc!!.caseCharging
            connectedGlasses["case_battery_level"] = sgc!!.caseBatteryLevel

            connectedGlasses["glasses_serial_number"] = sgc!!.glassesSerialNumber
            connectedGlasses["glasses_style"] = sgc!!.glassesStyle
            connectedGlasses["glasses_color"] = sgc!!.glassesColor
        }

        if (sgc is MentraLive) {
            connectedGlasses["glasses_wifi_ssid"] = sgc!!.wifiSsid
            connectedGlasses["glasses_wifi_connected"] = sgc!!.wifiConnected
            connectedGlasses["glasses_wifi_local_ip"] = sgc!!.wifiLocalIp
            connectedGlasses["glasses_hotspot_enabled"] = sgc!!.isHotspotEnabled
            connectedGlasses["glasses_hotspot_ssid"] = sgc!!.hotspotSsid
            connectedGlasses["glasses_hotspot_password"] = sgc!!.hotspotPassword
            connectedGlasses["glasses_hotspot_gateway_ip"] = sgc!!.hotspotGatewayIp
        }

        // G1 specific info
        // (sgc as? G1)?.let { g1 ->
        //     connectedGlasses["case_removed"] = g1.caseRemoved
        //     connectedGlasses["case_open"] = g1.caseOpen
        //     connectedGlasses["case_charging"] = g1.caseCharging
        //     // g1.caseBatteryLevel?.let {
        //     //     connectedGlasses["case_battery_level"] = it
        //     // }

        //     // if (!g1.glassesSerialNumber.isNullOrEmpty()) {
        //     //     connectedGlasses["glasses_serial_number"] = g1.glassesSerialNumber!!
        //     //     connectedGlasses["glasses_style"] = g1.glassesStyle ?: ""
        //     //     connectedGlasses["glasses_color"] = g1.glassesColor ?: ""
        //     // }
        // }

        // Bluetooth device name
        sgc?.getConnectedBluetoothName()?.let { bluetoothName ->
            connectedGlasses["bluetooth_name"] = bluetoothName
        }

        glassesSettings["brightness"] = brightness
        glassesSettings["auto_brightness"] = autoBrightness
        glassesSettings["dashboard_height"] = dashboardHeight
        glassesSettings["dashboard_depth"] = dashboardDepth
        glassesSettings["head_up_angle"] = headUpAngle
        glassesSettings["button_mode"] = buttonPressMode
        glassesSettings["button_photo_size"] = buttonPhotoSize

        val buttonVideoSettings =
                mapOf(
                        "width" to buttonVideoWidth,
                        "height" to buttonVideoHeight,
                        "fps" to buttonVideoFps
                )
        glassesSettings["button_video_settings"] = buttonVideoSettings
        glassesSettings["button_max_recording_time"] = buttonMaxRecordingTime
        glassesSettings["button_camera_led"] = buttonCameraLed

        val coreInfo =
                mapOf(
                        "default_wearable" to defaultWearable,
                        "preferred_mic" to preferredMic,
                        "is_searching" to isSearching,
                        "is_mic_enabled_for_frontend" to
                                (micEnabled && preferredMic == "glasses" && sgc?.ready == true),
                        "core_token" to coreToken,
                )

        val apps = emptyList<Any>()

        val authObj = mapOf("core_token_owner" to coreTokenOwner)

        val statusObj =
                mapOf(
                        "connected_glasses" to connectedGlasses,
                        "glasses_settings" to glassesSettings,
                        "apps" to apps,
                        "core_info" to coreInfo,
                        "auth" to authObj
                )

        Bridge.sendStatus(statusObj)
    }

    fun handle_update_settings(settings: Map<String, Any>) {
        Bridge.log("Mentra: Received update settings: $settings")

        // Update settings with new values
        (settings["preferred_mic"] as? String)?.let { newPreferredMic ->
            if (preferredMic != newPreferredMic) {
                updatePreferredMic(newPreferredMic)
            }
        }

        (settings["head_up_angle"] as? Int)?.let { newHeadUpAngle ->
            if (headUpAngle != newHeadUpAngle) {
                updateGlassesHeadUpAngle(newHeadUpAngle)
            }
        }

        (settings["brightness"] as? Int)?.let { newBrightness ->
            if (brightness != newBrightness) {
                updateGlassesBrightness(newBrightness, false)
            }
        }

        (settings["dashboard_height"] as? Int)?.let { newDashboardHeight ->
            if (dashboardHeight != newDashboardHeight) {
                updateGlassesHeight(newDashboardHeight)
            }
        }

        (settings["dashboard_depth"] as? Int)?.let { newDashboardDepth ->
            if (dashboardDepth != newDashboardDepth) {
                updateGlassesDepth(newDashboardDepth)
            }
        }

        (settings["auto_brightness"] as? Boolean)?.let { newAutoBrightness ->
            if (autoBrightness != newAutoBrightness) {
                updateGlassesBrightness(brightness, newAutoBrightness)
            }
        }

        (settings["sensing"] as? Boolean)?.let { newSensingEnabled ->
            if (sensingEnabled != newSensingEnabled) {
                updateSensing(newSensingEnabled)
            }
        }

        (settings["power_saving_mode"] as? Boolean)?.let { newPowerSavingMode ->
            if (powerSavingMode != newPowerSavingMode) {
                updatePowerSavingMode(newPowerSavingMode)
            }
        }

        (settings["always_on_status_bar"] as? Boolean)?.let { newAlwaysOnStatusBar ->
            if (alwaysOnStatusBar != newAlwaysOnStatusBar) {
                updateAlwaysOnStatusBar(newAlwaysOnStatusBar)
            }
        }

        (settings["bypass_vad_for_debugging"] as? Boolean)?.let { newBypassVad ->
            if (bypassVad != newBypassVad) {
                updateBypassVad(newBypassVad)
            }
        }

        (settings["enforce_local_transcription"] as? Boolean)?.let { newEnforceLocalTranscription ->
            if (enforceLocalTranscription != newEnforceLocalTranscription) {
                updateEnforceLocalTranscription(newEnforceLocalTranscription)
            }
        }

        (settings["metric_system"] as? Boolean)?.let { newMetricSystem ->
            if (metricSystem != newMetricSystem) {
                updateMetricSystem(newMetricSystem)
            }
        }

        (settings["contextual_dashboard"] as? Boolean)?.let { newContextualDashboard ->
            if (contextualDashboard != newContextualDashboard) {
                updateContextualDashboard(newContextualDashboard)
            }
        }

        (settings["button_mode"] as? String)?.let { newButtonMode ->
            if (buttonPressMode != newButtonMode) {
                updateButtonMode(newButtonMode)
            }
        }

        (settings["button_video_fps"] as? Int)?.let { newFps ->
            if (buttonVideoFps != newFps) {
                updateButtonVideoSettings(buttonVideoWidth, buttonVideoHeight, newFps)
            }
        }

        (settings["button_video_width"] as? Int)?.let { newWidth ->
            if (buttonVideoWidth != newWidth) {
                updateButtonVideoSettings(newWidth, buttonVideoHeight, buttonVideoFps)
            }
        }

        (settings["button_video_height"] as? Int)?.let { newHeight ->
            if (buttonVideoHeight != newHeight) {
                updateButtonVideoSettings(buttonVideoWidth, newHeight, buttonVideoFps)
            }
        }

        (settings["button_photo_size"] as? String)?.let { newPhotoSize ->
            if (buttonPhotoSize != newPhotoSize) {
                updateButtonPhotoSize(newPhotoSize)
            }
        }

        (settings["button_max_recording_time"] as? Int)?.let { newMaxTime ->
            if (buttonMaxRecordingTime != newMaxTime) {
                updateButtonMaxRecordingTime(newMaxTime)
            }
        }

        (settings["default_wearable"] as? String)?.let { newDefaultWearable ->
            if (defaultWearable != newDefaultWearable) {
                defaultWearable = newDefaultWearable
                Bridge.saveSetting("default_wearable", newDefaultWearable)
            }
        }

        (settings["device_name"] as? String)?.let { newDeviceName ->
            if (deviceName != newDeviceName) {
                deviceName = newDeviceName
            }
        }

        (settings["device_address"] as? String)?.let { newDeviceAddress ->
            if (deviceAddress != newDeviceAddress) {
                deviceAddress = newDeviceAddress
            }
        }
    }

    // MARK: Cleanup
    fun cleanup() {
        // Cleanup code here
    }
}
