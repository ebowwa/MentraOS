package com.mentra.core

import com.mentra.core.services.NotificationListener
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CoreModule : Module() {
    private val bridge: Bridge by lazy { Bridge.getInstance() }
    private var coreManager: CoreManager? = null

    override fun definition() = ModuleDefinition {
        Name("Core")

        // Define events that can be sent to JavaScript
        Events("CoreMessageEvent", "onChange")

        OnCreate {
            // Initialize Bridge with Android context and event callback
            Bridge.initialize(
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            ) { eventName, data -> sendEvent(eventName, data) }

            // initialize CoreManager after Bridge is ready
            coreManager = CoreManager.getInstance()
        }

        // MARK: - Display Commands

        AsyncFunction("displayEvent") { params: Map<String, Any> ->
            coreManager?.handle_display_event(params)
        }

        AsyncFunction("displayText") { params: Map<String, Any> ->
            coreManager?.handle_display_text(params)
        }

        // MARK: - Connection Commands

        AsyncFunction("requestStatus") { coreManager?.handle_request_status() }

        AsyncFunction("connectDefault") { coreManager?.handle_connect_default() }

        AsyncFunction("connectByName") { deviceName: String ->
            coreManager?.handle_connect_by_name(deviceName)
        }

        AsyncFunction("connectSimulated") { coreManager?.handle_connect_simulated() }

        AsyncFunction("disconnect") { coreManager?.handle_disconnect() }

        AsyncFunction("forget") { coreManager?.handle_forget() }

        AsyncFunction("findCompatibleDevices") { modelName: String ->
            coreManager?.handle_find_compatible_devices(modelName)
        }

        AsyncFunction("showDashboard") { coreManager?.handle_show_dashboard() }

        // MARK: - WiFi Commands

        AsyncFunction("requestWifiScan") { coreManager?.handle_request_wifi_scan() }

        AsyncFunction("sendWifiCredentials") { ssid: String, password: String ->
            coreManager?.handle_send_wifi_credentials(ssid, password)
        }

        AsyncFunction("setHotspotState") { enabled: Boolean ->
            coreManager?.handle_set_hotspot_state(enabled)
        }

        // MARK: - Gallery Commands

        AsyncFunction("queryGalleryStatus") { coreManager?.handle_query_gallery_status() }

        AsyncFunction("photoRequest") {
                requestId: String,
                appId: String,
                size: String,
                webhookUrl: String,
                authToken: String,
                compress: String ->
            coreManager?.handle_photo_request(requestId, appId, size, webhookUrl, authToken, compress)
        }

        // MARK: - Video Recording Commands

        AsyncFunction("startBufferRecording") { coreManager?.handle_start_buffer_recording() }

        AsyncFunction("stopBufferRecording") { coreManager?.handle_stop_buffer_recording() }

        AsyncFunction("saveBufferVideo") { requestId: String, durationSeconds: Int ->
            coreManager?.handle_save_buffer_video(requestId, durationSeconds)
        }

        AsyncFunction("startVideoRecording") { requestId: String, save: Boolean ->
            coreManager?.handle_start_video_recording(requestId, save)
        }

        AsyncFunction("stopVideoRecording") { requestId: String ->
            coreManager?.handle_stop_video_recording(requestId)
        }

        // MARK: - RTMP Stream Commands

        AsyncFunction("startRtmpStream") { params: Map<String, Any> ->
            coreManager?.handle_send_rtmp_stream_start(params.toMutableMap())
        }

        AsyncFunction("stopRtmpStream") {
            coreManager?.handle_stop_rtmp_stream()
        }

        AsyncFunction("keepRtmpStreamAlive") { params: Map<String, Any> ->
            coreManager?.handle_keep_rtmp_stream_alive(params.toMutableMap())
        }

        // MARK: - Microphone Commands

        AsyncFunction("microphoneStateChange") {
                requiredDataStrings: List<String>,
                bypassVad: Boolean ->
            coreManager?.handle_microphone_state_change(requiredDataStrings, bypassVad)
        }

        AsyncFunction("restartTranscriber") { coreManager?.restartTranscriber() }

        // MARK: - RGB LED Control

        AsyncFunction("rgbLedControl") {
                requestId: String,
                packageName: String?,
                action: String,
                color: String?,
                ontime: Int,
                offtime: Int,
                count: Int ->
            coreManager?.handle_rgb_led_control(requestId, packageName, action,
                    color, ontime, offtime, count)
        }

        // MARK: - Settings Commands

        AsyncFunction("updateSettings") { params: Map<String, Any> ->
            coreManager?.handle_update_settings(params)
        }

        // MARK: - STT Commands

        AsyncFunction("setSttModelDetails") { path: String, languageCode: String ->
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            com.mentra.core.stt.STTTools.setSttModelDetails(context, path, languageCode)
        }

        AsyncFunction("getSttModelPath") { ->
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            com.mentra.core.stt.STTTools.getSttModelPath(context)
        }

        AsyncFunction("checkSttModelAvailable") { ->
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            com.mentra.core.stt.STTTools.checkSTTModelAvailable(context)
        }

        AsyncFunction("validateSttModel") { path: String ->
            com.mentra.core.stt.STTTools.validateSTTModel(path)
        }

        AsyncFunction("extractTarBz2") { sourcePath: String, destinationPath: String ->
            com.mentra.core.stt.STTTools.extractTarBz2(sourcePath, destinationPath)
        }

        // MARK: - Android-specific Commands

        AsyncFunction("getInstalledApps") {
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            NotificationListener.getInstance(context).getInstalledApps()
        }

        AsyncFunction("hasNotificationListenerPermission") {
            val context =
                    appContext.reactContext
                            ?: appContext.currentActivity
                                    ?: throw IllegalStateException("No context available")
            NotificationListener.getInstance(context).hasNotificationListenerPermission()
        }
    }
}
