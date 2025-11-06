package com.mentra.core.services

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothHeadset
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.*
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.mentra.core.Bridge
import com.mentra.core.CoreManager
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*

class PhoneMic private constructor(private val context: Context) {

    companion object {
        @Volatile private var instance: PhoneMic? = null

        fun getInstance(context: Context): PhoneMic {
            return instance
                    ?: synchronized(this) {
                        instance ?: PhoneMic(context.applicationContext).also { instance = it }
                    }
        }

        // Audio configuration constants
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val BUFFER_SIZE_MULTIPLIER = 2

        // Debouncing and retry constants
        private const val MODE_CHANGE_DEBOUNCE_MS = 500L
        private const val MAX_SCO_RETRIES = 3
        private const val FOCUS_REGAIN_DELAY_MS = 500L
        private const val SAMSUNG_MIC_TEST_DELAY_MS = 500L
        private const val MIC_SWITCH_DELAY_MS = 300L  // Time for CoreManager to switch mics
    }

    // Audio recording components
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private val isRecording = AtomicBoolean(false)

    // Mic source management
    private val micSourceManager = MicSourceManager(context)
    private var currentMicConfig: MicSourceManager.MicConfig? = null

    // Audio manager and routing
    private val audioManager: AudioManager =
            context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private var bluetoothHeadset: BluetoothHeadset? = null

    // Broadcast receivers
    private var audioRouteReceiver: BroadcastReceiver? = null
    private var bluetoothReceiver: BroadcastReceiver? = null

    // Phone call detection
    private var telephonyManager: TelephonyManager? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var isPhoneCallActive = false

    // Audio focus management
    private var audioFocusListener: AudioManager.OnAudioFocusChangeListener? = null
    private var hasAudioFocus = false
    private var audioFocusRequest: AudioFocusRequest? = null // For Android 8.0+

    // Audio recording conflict detection (API 24+)
    private var audioRecordingCallback: AudioManager.AudioRecordingCallback? = null
    private val ourAudioSessionIds = mutableListOf<Int>()
    private var isExternalAudioActive = false

    // State tracking
    private var lastModeChangeTime = 0L
    private var scoRetries = 0
    private var pendingRecordingRequest = false

    // Handler for main thread operations
    private val mainHandler = Handler(Looper.getMainLooper())

    // Coroutine scope for async operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        setupPhoneCallDetection()
        setupAudioFocusListener()
        setupAudioRecordingDetection()
        setupAudioRouteListener()
        setupBluetoothListener()
    }

    // MARK: - Public Methods (Simplified Interface)

    /**
     * Start recording from the phone microphone Will automatically handle SCO mode, conflicts, and
     * fallbacks
     */
    fun startRecording(): Boolean {
        // Ensure we're on main thread for consistency
        if (Looper.myLooper() != Looper.getMainLooper()) {
            var result = false
            runBlocking { withContext(Dispatchers.Main) { result = startRecording() } }
            return result
        }

        // Check if already recording
        if (isRecording.get()) {
            Bridge.log("MIC: Already recording")
            return true
        }

        // Check permissions
        if (!checkPermissions()) {
            Bridge.log("MIC: Microphone permissions not granted")
            notifyCoreManager("permission_denied", emptyList())
            return false
        }

        // Smart debouncing
        val now = System.currentTimeMillis()
        if (now - lastModeChangeTime < MODE_CHANGE_DEBOUNCE_MS) {
            Bridge.log("MIC: Debouncing rapid recording request")
            pendingRecordingRequest = true
            mainHandler.postDelayed(
                    {
                        if (pendingRecordingRequest && !isRecording.get()) {
                            startRecordingInternal()
                        }
                        pendingRecordingRequest = false
                    },
                    MODE_CHANGE_DEBOUNCE_MS
            )
            return false
        }

        return startRecordingInternal()
    }

    /** Stop recording from the phone microphone */
    fun stopRecording() {
        // Ensure we're on main thread for consistency
        if (Looper.myLooper() != Looper.getMainLooper()) {
            runBlocking { withContext(Dispatchers.Main) { stopRecording() } }
            return
        }

        if (!isRecording.get()) {
            return
        }

        Bridge.log("MIC: Stopping recording")

        // Clean up recording
        cleanUpRecording()

        // Abandon audio focus
        abandonAudioFocus()

        // Clean up SCO if it was activated
        val config = currentMicConfig
        if (config != null && config.activateSCO) {
            cleanupSco()
        } else {
            // For non-SCO recordings, just reset mode to normal
            audioManager.mode = AudioManager.MODE_NORMAL
        }

        // Clear current config
        currentMicConfig = null

        // Notify CoreManager
        notifyCoreManager("recording_stopped", getAvailableInputDevices().values.toList())

        Bridge.log("MIC: Recording stopped")
    }

    // MARK: - Private Methods

    private fun startRecordingInternal(): Boolean {
        lastModeChangeTime = System.currentTimeMillis()

        // Check for conflicts
        if (isPhoneCallActive) {
            Bridge.log("MIC: Cannot start recording - phone call active")
            notifyCoreManager("phone_call_active", emptyList())
            return false
        }

        // Get mic source from CoreManager
        val preferredMic = CoreManager.getInstance().preferredMic
        val micSource = MicSource.fromString(preferredMic)

        // Get configuration for selected mic source
        currentMicConfig = micSourceManager.getMicConfig(micSource)
        val config = currentMicConfig!!

        Bridge.log("MIC: Starting with source: ${config.source}, useBLEMic: ${config.useBLEMic}, usePhoneMic: ${config.usePhoneMic}, activateSCO: ${config.activateSCO}")

        // Request audio focus
        if (!requestAudioFocus(config.focusGain)) {
            Bridge.log("MIC: Failed to get audio focus")
            currentMicConfig = null  // Clear config since we're not starting
            // On Samsung, test if another app actually needs the mic
            if (isSamsungDevice()) {
                testMicrophoneAvailabilityOnSamsung()
            } else {
                notifyCoreManager("audio_focus_denied", emptyList())
            }
            return false
        }

        return when {
            config.useBLEMic -> {
                // Use glasses custom BLE mic
                Bridge.log("MIC: Using glasses custom BLE mic")
                notifyCoreManager("enable_glasses_mic", emptyList())
                true
            }
            config.activateSCO -> {
                // Try Bluetooth SCO for external HFP mic
                Bridge.log("MIC: Attempting Bluetooth SCO for external mic")
                startRecordingWithSco(config)
            }
            config.usePhoneMic -> {
                // Use phone mic
                Bridge.log("MIC: Using phone mic")
                startRecordingNormal(config)
            }
            else -> {
                Bridge.log("MIC: No valid mic configuration")
                false
            }
        }
    }

    private fun startRecordingWithSco(config: MicSourceManager.MicConfig): Boolean {
        try {
            // Set audio mode from config
            audioManager.mode = config.audioMode

            // Start Bluetooth SCO
            audioManager.startBluetoothSco()
            audioManager.isBluetoothScoOn = true

            // Wait briefly for SCO to connect
            Thread.sleep(100)

            val success = createAndStartAudioRecord(config.audioSource)

            if (!success && config.canFallbackToPhone) {
                // SCO failed, fallback to phone mic
                Bridge.log("MIC: Bluetooth SCO failed, falling back to phone mic")
                cleanupSco()
                val phoneConfig = micSourceManager.getMicConfig(MicSource.PHONE_INTERNAL)
                currentMicConfig = phoneConfig  // Update config to reflect actual source
                return startRecordingNormal(phoneConfig)
            }

            return success
        } catch (e: Exception) {
            Bridge.log("MIC: SCO recording failed: ${e.message}")

            cleanupSco()

            // Fallback to phone mic if allowed
            if (config.canFallbackToPhone) {
                Bridge.log("MIC: Falling back to phone mic after SCO error")
                val phoneConfig = micSourceManager.getMicConfig(MicSource.PHONE_INTERNAL)
                currentMicConfig = phoneConfig  // Update config to reflect actual source
                return startRecordingNormal(phoneConfig)
            }

            return false
        }
    }

    private fun cleanupSco() {
        audioManager.stopBluetoothSco()
        audioManager.isBluetoothScoOn = false
        audioManager.mode = AudioManager.MODE_NORMAL
    }

    private fun startRecordingNormal(config: MicSourceManager.MicConfig): Boolean {
        try {
            // Set audio mode from config
            audioManager.mode = config.audioMode

            return createAndStartAudioRecord(config.audioSource)
        } catch (e: Exception) {
            Bridge.log("MIC: Normal recording failed: ${e.message}")
            return false
        }
    }

    private fun createAndStartAudioRecord(audioSource: Int): Boolean {
        // Calculate buffer size
        val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)

        if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
            Bridge.log("MIC: Failed to get min buffer size")
            return false
        }

        val bufferSize = minBufferSize * BUFFER_SIZE_MULTIPLIER

        // Create AudioRecord
        audioRecord =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    AudioRecord.Builder()
                            .setAudioSource(audioSource)
                            .setAudioFormat(
                                    AudioFormat.Builder()
                                            .setSampleRate(SAMPLE_RATE)
                                            .setChannelMask(CHANNEL_CONFIG)
                                            .setEncoding(AUDIO_FORMAT)
                                            .build()
                            )
                            .setBufferSizeInBytes(bufferSize)
                            .build()
                } else {
                    AudioRecord(audioSource, SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize)
                }

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            Bridge.log("MIC: AudioRecord failed to initialize")
            audioRecord?.release()
            audioRecord = null
            return false
        }

        // Register this AudioRecord's session ID
        audioRecord?.let { ourAudioSessionIds.add(it.audioSessionId) }

        // Start recording
        audioRecord?.startRecording()
        isRecording.set(true)

        // Start recording thread
        startRecordingThread(bufferSize)

        // Notify CoreManager
        val activeDevice = getActiveInputDevice() ?: "Unknown"
        Bridge.log("MIC: Started recording from: $activeDevice")
        notifyCoreManager("recording_started", listOf(activeDevice))

        // Reset retry counter on success
        scoRetries = 0

        return true
    }

    private fun startRecordingThread(bufferSize: Int) {
        recordingThread =
                Thread {
                    android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)

                    val audioBuffer = ShortArray(bufferSize / 2)

                    while (isRecording.get()) {
                        val readResult = audioRecord?.read(audioBuffer, 0, audioBuffer.size) ?: 0

                        if (readResult > 0) {
                            // Convert short array to byte array (16-bit PCM)
                            val pcmData = ByteArray(readResult * 2)
                            val byteBuffer = ByteBuffer.wrap(pcmData).order(ByteOrder.LITTLE_ENDIAN)

                            for (i in 0 until readResult) {
                                byteBuffer.putShort(audioBuffer[i])
                            }

                            // Send PCM data to CoreManager
                            CoreManager.getInstance().handlePcm(pcmData)
                        }
                    }
                }
                        .apply {
                            name = "AudioRecordingThread"
                            start()
                        }
    }

    private fun cleanUpRecording() {
        isRecording.set(false)

        // Stop recording thread
        recordingThread?.interrupt()
        recordingThread = null

        // Stop and release AudioRecord
        audioRecord?.let { record ->
            try {
                // Unregister session ID
                ourAudioSessionIds.remove(record.audioSessionId)

                record.stop()
                record.release()
            } catch (e: Exception) {
                Bridge.log("MIC: Error cleaning up AudioRecord: ${e.message}")
            }
        }
        audioRecord = null
    }

    private fun setupPhoneCallDetection() {
        // Check for phone state permission
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) !=
                        PackageManager.PERMISSION_GRANTED
        ) {
            Bridge.log("MIC: READ_PHONE_STATE permission not granted, skipping call detection")
            return
        }

        telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

        phoneStateListener =
                object : PhoneStateListener() {
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        val wasCallActive = isPhoneCallActive
                        isPhoneCallActive = (state != TelephonyManager.CALL_STATE_IDLE)

                        if (wasCallActive != isPhoneCallActive) {
                            if (isPhoneCallActive) {
                                Bridge.log("MIC: Phone call started")
                                if (isRecording.get()) {
                                    val config = currentMicConfig
                                    if (config != null && config.canFallbackToGlasses) {
                                        // Can fallback to glasses mic
                                        Bridge.log("MIC: Phone call conflict - switching to glasses mic")
                                        notifyCoreManager("phone_call_interruption", emptyList())
                                        // Give CoreManager time to switch to glasses mic
                                        mainHandler.postDelayed({
                                            stopRecording()
                                        }, MIC_SWITCH_DELAY_MS)
                                    } else {
                                        // No fallback available - just stop
                                        Bridge.log("MIC: Phone call conflict - no fallback available")
                                        stopRecording()
                                        notifyCoreManager("phone_call_active", emptyList())
                                    }
                                } else {
                                    // Not currently recording, but still notify about unavailability
                                    notifyCoreManager("phone_call_active", emptyList())
                                }
                            } else {
                                Bridge.log("MIC: Phone call ended")
                                notifyCoreManager(
                                        "phone_call_ended",
                                        getAvailableInputDevices().values.toList()
                                )
                            }
                        }
                    }
                }

        telephonyManager?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
    }

    private fun setupAudioFocusListener() {
        audioFocusListener =
                AudioManager.OnAudioFocusChangeListener { focusChange ->
                    when (focusChange) {
                        AudioManager.AUDIOFOCUS_LOSS -> {
                            Bridge.log("MIC: Permanent audio focus loss")
                            hasAudioFocus = false
                            // Don't stop recording for media playback - this is usually just media apps
                        }
                        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                            Bridge.log("MIC: Transient audio focus loss")
                            hasAudioFocus = false

                            if (isSamsungDevice() && isRecording.get()) {
                                // Samsung needs special handling
                                testMicrophoneAvailabilityOnSamsung()
                            } else {
                                // Wait to see if another app actually records
                                mainHandler.postDelayed(
                                        {
                                            if (isExternalAudioActive && isRecording.get()) {
                                                val config = currentMicConfig
                                                if (config != null && config.canFallbackToGlasses) {
                                                    // Can fallback to glasses mic
                                                    Bridge.log("MIC: Audio conflict - switching to glasses mic")
                                                    notifyCoreManager("external_app_recording", emptyList())
                                                    // Give CoreManager time to switch to glasses mic
                                                    mainHandler.postDelayed({
                                                        stopRecording()
                                                    }, MIC_SWITCH_DELAY_MS)
                                                } else {
                                                    // No fallback available - just stop
                                                    Bridge.log("MIC: Audio conflict - no fallback available")
                                                    stopRecording()
                                                    notifyCoreManager("external_app_recording", emptyList())
                                                }
                                            }
                                        },
                                        500
                                )
                            }
                        }
                        AudioManager.AUDIOFOCUS_GAIN -> {
                            Bridge.log("MIC: Regained audio focus")
                            hasAudioFocus = true

                            if (isSamsungDevice()) {
                                isExternalAudioActive = false
                            }

                            // Notify that focus is available again
                            if (!isRecording.get()) {
                                notifyCoreManager(
                                        "audio_focus_available",
                                        getAvailableInputDevices().values.toList()
                                )
                            }
                        }
                    }
                }
    }

    private fun setupAudioRecordingDetection() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            audioRecordingCallback =
                    object : AudioManager.AudioRecordingCallback() {
                        override fun onRecordingConfigChanged(
                                configs: MutableList<AudioRecordingConfiguration>?
                        ) {
                            configs ?: return

                            // Filter out our own recordings
                            val otherAppRecordings =
                                    configs.filter { config ->
                                        !ourAudioSessionIds.contains(config.clientAudioSessionId)
                                    }

                            val wasExternalActive = isExternalAudioActive
                            isExternalAudioActive = otherAppRecordings.isNotEmpty()

                            if (wasExternalActive != isExternalAudioActive) {
                                if (isExternalAudioActive) {
                                    Bridge.log("MIC: External app started recording")
                                    if (isRecording.get()) {
                                        val config = currentMicConfig
                                        if (config != null && config.canFallbackToGlasses) {
                                            // Can fallback to glasses mic
                                            Bridge.log("MIC: Conflict detected - switching to glasses mic")
                                            notifyCoreManager("external_app_recording", emptyList())
                                            // Give CoreManager time to switch to glasses mic
                                            mainHandler.postDelayed({
                                                stopRecording()
                                            }, MIC_SWITCH_DELAY_MS)
                                        } else {
                                            // No fallback available - just stop
                                            Bridge.log("MIC: Conflict detected - no fallback available")
                                            stopRecording()
                                            notifyCoreManager("external_app_recording", emptyList())
                                        }
                                    } else {
                                        // Not currently recording, but still notify about unavailability
                                        notifyCoreManager("external_app_recording", emptyList())
                                    }
                                } else {
                                    Bridge.log("MIC: External app stopped recording")
                                    // Notify CoreManager that phone mic is available again
                                    notifyCoreManager(
                                            "external_app_stopped",
                                            getAvailableInputDevices().values.toList()
                                    )
                                }
                            }
                        }
                    }

            if (audioRecordingCallback != null) {
                audioManager.registerAudioRecordingCallback(audioRecordingCallback!!, mainHandler)
            }
        }
    }

    private fun setupAudioRouteListener() {
        audioRouteReceiver =
                object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        when (intent?.action) {
                            AudioManager.ACTION_AUDIO_BECOMING_NOISY -> {
                                Bridge.log("MIC: Audio becoming noisy")
                                handleAudioRouteChange()
                            }
                            AudioManager.ACTION_HEADSET_PLUG -> {
                                val state = intent.getIntExtra("state", -1)
                                if (state == 1) {
                                    Bridge.log("MIC: Headset connected")
                                } else if (state == 0) {
                                    Bridge.log("MIC: Headset disconnected")
                                }
                                handleAudioRouteChange()
                            }
                            AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED -> {
                                val state =
                                        intent.getIntExtra(AudioManager.EXTRA_SCO_AUDIO_STATE, -1)
                                when (state) {
                                    AudioManager.SCO_AUDIO_STATE_CONNECTED -> {
                                        Bridge.log("MIC: Bluetooth SCO connected")
                                        handleAudioRouteChange()
                                    }
                                    AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> {
                                        Bridge.log("MIC: Bluetooth SCO disconnected")
                                        handleAudioRouteChange()
                                    }
                                }
                            }
                        }
                    }
                }

        val filter =
                IntentFilter().apply {
                    addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
                    addAction(AudioManager.ACTION_HEADSET_PLUG)
                    addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
                }

        context.registerReceiver(audioRouteReceiver, filter)
    }

    private fun setupBluetoothListener() {
        bluetoothReceiver =
                object : BroadcastReceiver() {
                    override fun onReceive(context: Context?, intent: Intent?) {
                        when (intent?.action) {
                            BluetoothDevice.ACTION_ACL_CONNECTED -> {
                                val device =
                                        intent.getParcelableExtra<BluetoothDevice>(
                                                BluetoothDevice.EXTRA_DEVICE
                                        )
                                Bridge.log(
                                        "MIC: Bluetooth device connected: ${device?.name ?: "Unknown"}"
                                )
                                handleAudioRouteChange()
                            }
                            BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                                val device =
                                        intent.getParcelableExtra<BluetoothDevice>(
                                                BluetoothDevice.EXTRA_DEVICE
                                        )
                                Bridge.log(
                                        "MIC: Bluetooth device disconnected: ${device?.name ?: "Unknown"}"
                                )
                                handleAudioRouteChange()
                            }
                        }
                    }
                }

        val filter =
                IntentFilter().apply {
                    addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
                    addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
                }

        context.registerReceiver(bluetoothReceiver, filter)
    }

    private fun handleAudioRouteChange() {
        val availableInputs = getAvailableInputDevices().values.toList()
        notifyCoreManager("audio_route_changed", availableInputs)
    }

    private fun requestAudioFocus(focusGain: Int): Boolean {
        val result =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val audioAttributes =
                            AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .build()

                    audioFocusRequest =
                            AudioFocusRequest.Builder(focusGain)
                                    .setAudioAttributes(audioAttributes)
                                    .setOnAudioFocusChangeListener(
                                            audioFocusListener!!,
                                            mainHandler
                                    )
                                    .setAcceptsDelayedFocusGain(false)
                                    .build()

                    audioManager.requestAudioFocus(audioFocusRequest!!)
                } else {
                    audioManager.requestAudioFocus(
                            audioFocusListener,
                            AudioManager.STREAM_VOICE_CALL,
                            focusGain
                    )
                }

        hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        return hasAudioFocus
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest!!)
            audioFocusRequest = null
        } else {
            audioManager.abandonAudioFocus(audioFocusListener)
        }

        hasAudioFocus = false
    }

    private fun testMicrophoneAvailabilityOnSamsung() {
        Bridge.log("MIC: Samsung - testing mic availability")

        val currentRecord = audioRecord

        // Temporarily stop recording
        cleanUpRecording()

        // Wait and try to recreate
        mainHandler.postDelayed(
                {
                    if (tryCreateTestAudioRecord()) {
                        Bridge.log("MIC: Samsung - mic available, just playback app")
                        // Restart recording
                        startRecordingInternal()
                    } else {
                        Bridge.log("MIC: Samsung - mic taken by another app")
                        isExternalAudioActive = true

                        val config = currentMicConfig
                        if (config != null && config.canFallbackToGlasses) {
                            // Can fallback to glasses mic
                            Bridge.log("MIC: Samsung conflict - switching to glasses mic")
                            notifyCoreManager("samsung_mic_conflict", emptyList())
                            // Give CoreManager time to switch to glasses mic
                            mainHandler.postDelayed({
                                stopRecording()
                            }, MIC_SWITCH_DELAY_MS)
                        } else {
                            // No fallback available
                            Bridge.log("MIC: Samsung conflict - no fallback available")
                            notifyCoreManager("samsung_mic_conflict", emptyList())
                        }
                    }
                },
                SAMSUNG_MIC_TEST_DELAY_MS
        )
    }

    private fun tryCreateTestAudioRecord(): Boolean {
        var testRecorder: AudioRecord? = null
        try {
            val minBufferSize =
                    AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)

            testRecorder =
                    AudioRecord(
                            MediaRecorder.AudioSource.MIC,
                            SAMPLE_RATE,
                            CHANNEL_CONFIG,
                            AUDIO_FORMAT,
                            minBufferSize
                    )

            return testRecorder.state == AudioRecord.STATE_INITIALIZED
        } catch (e: Exception) {
            return false
        } finally {
            testRecorder?.release()
        }
    }

    private fun isSamsungDevice(): Boolean {
        return Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    }

    private fun checkPermissions(): Boolean {
        return ActivityCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
    }

    private fun getAvailableInputDevices(): Map<String, String> {
        val deviceInfo = mutableMapOf<String, String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
            for (device in devices) {
                val name =
                        when (device.type) {
                            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Built-in Microphone"
                            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth Headset"
                            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired Headset"
                            AudioDeviceInfo.TYPE_USB_HEADSET -> "USB Headset"
                            else -> device.productName.toString()
                        }
                deviceInfo[device.id.toString()] = name
            }
        } else {
            deviceInfo["default"] = "Default Microphone"
            if (audioManager.isBluetoothScoAvailableOffCall) {
                deviceInfo["bluetooth"] = "Bluetooth Headset"
            }
            if (audioManager.isWiredHeadsetOn) {
                deviceInfo["wired"] = "Wired Headset"
            }
        }

        return deviceInfo
    }

    private fun getActiveInputDevice(): String? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            audioRecord?.routedDevice?.let { device ->
                when (device.type) {
                    AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Built-in Microphone"
                    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth Headset"
                    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired Headset"
                    AudioDeviceInfo.TYPE_USB_HEADSET -> "USB Headset"
                    else -> device.productName.toString()
                }
            }
        } else {
            when {
                audioManager.isBluetoothScoOn -> "Bluetooth Headset"
                audioManager.isWiredHeadsetOn -> "Wired Headset"
                else -> "Built-in Microphone"
            }
        }
    }

    private fun notifyCoreManager(reason: String, availableInputs: List<String>) {
        mainHandler.post {
            CoreManager.getInstance()
                    .onRouteChange(reason = reason, availableInputs = availableInputs)
        }
    }

    fun cleanup() {
        stopRecording()

        // CRITICAL: Force reset audio mode to prevent system-wide Bluetooth audio breakage
        // This ensures that even if stopRecording() failed, we restore normal audio routing
        try {
            if (audioManager.isBluetoothScoOn) {
                Bridge.log("MIC: Force stopping Bluetooth SCO in cleanup")
                audioManager.stopBluetoothSco()
                audioManager.isBluetoothScoOn = false
            }

            if (audioManager.mode != AudioManager.MODE_NORMAL) {
                Bridge.log("MIC: Force resetting audio mode to NORMAL in cleanup")
                audioManager.mode = AudioManager.MODE_NORMAL
            }
        } catch (e: Exception) {
            Bridge.log("MIC: Error during audio mode cleanup: ${e.message}")
        }

        // Unregister listeners
        phoneStateListener?.let { telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE) }

        audioRecordingCallback?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                audioManager.unregisterAudioRecordingCallback(it)
            }
        }

        // Unregister receivers
        try {
            audioRouteReceiver?.let { context.unregisterReceiver(it) }
            bluetoothReceiver?.let { context.unregisterReceiver(it) }
        } catch (e: Exception) {
            Bridge.log("Error unregistering receivers: ${e.message}")
        }

        // Cancel coroutines
        scope.cancel()

        Bridge.log("MIC: Cleaned up")
    }
}
