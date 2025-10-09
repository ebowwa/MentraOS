//
//  Bridge.kt
//  AOS
//
//  Created by Matthew Fosse on 3/4/25.
//

package com.mentra.mentra

import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.mentra.mentra.stt.STTTools
import java.util.HashMap
import kotlin.jvm.JvmStatic
import kotlin.jvm.Synchronized
import kotlin.jvm.Throws
import kotlin.jvm.Volatile
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Bridge class for core communication between React Native and native Android code This is the
 * Android equivalent of the iOS Bridge.swift
 */
public class Bridge private constructor() {
    private var mentraManager: MentraManager? = null

    companion object {
        private const val TAG = "Bridge"

        @Volatile private var instance: Bridge? = null

        private var reactContext: ReactApplicationContext? = null
        private var emitter: DeviceEventManagerModule.RCTDeviceEventEmitter? = null

        @JvmStatic
        @Synchronized
        fun getInstance(): Bridge {
            if (instance == null) {
                instance = Bridge()
            }
            return instance!!
        }

        /**
         * Initialize the Bridge with React context This should be called from BridgeModule
         * constructor
         */
        @JvmStatic
        fun initialize(context: ReactApplicationContext) {
            Log.d(TAG, "Initializing Bridge with React context")
            reactContext = context
            // Don't get emitter here - it will be fetched lazily when needed
        }

        /** Log a message and send it to React Native */
        @JvmStatic
        fun log(message: String) {
            val msg = "CORE:$message"
            sendEvent("CoreMessageEvent", msg)
        }

        /** Send an event to React Native */
        @JvmStatic
        fun sendEvent(eventName: String, body: String) {
            if (reactContext != null && reactContext!!.hasActiveCatalystInstance()) {
                // Lazily get the emitter when needed
                if (emitter == null) {
                    emitter =
                            reactContext!!.getJSModule(
                                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                            )
                }
                if (emitter != null) {
                    emitter!!.emit(eventName, body)
                }
            } else {
                Log.e(TAG, "React context is null or has no active catalyst instance")
            }
        }

        /** Show a banner message in the UI */
        @JvmStatic
        fun showBanner(type: String, message: String) {
            val data = HashMap<String, Any>()
            data["type"] = type
            data["message"] = message
            sendTypedMessage("show_banner", data as Map<String, Any>)
        }

        /** Send head position event */
        @JvmStatic
        fun sendHeadUp(isUp: Boolean) {
            val data = HashMap<String, Any>()
            data["position"] = isUp
            sendTypedMessage("head_up", data as Map<String, Any>)
        }

        /** Send pair failure event */
        @JvmStatic
        fun sendPairFailureEvent(error: String) {
            val data = HashMap<String, Any>()
            data["error"] = error
            sendTypedMessage("pair_failure", data as Map<String, Any>)
        }

        /** Send microphone data */
        @JvmStatic
        fun sendMicData(data: ByteArray) {
            val base64String = Base64.encodeToString(data, Base64.NO_WRAP)
            val body = HashMap<String, Any>()
            body["base64"] = base64String
            sendTypedMessage("mic_data", body as Map<String, Any>)
        }

        /** Save a setting */
        @JvmStatic
        fun saveSetting(key: String, value: Any) {
            val body = HashMap<String, Any>()
            body["key"] = key
            body["value"] = value
            sendTypedMessage("save_setting", body as Map<String, Any>)
        }

        /** Send VAD (Voice Activity Detection) status */
        @JvmStatic
        fun sendVadStatus(isSpeaking: Boolean) {
            val vadMsg = HashMap<String, Any>()
            vadMsg["type"] = "VAD"
            vadMsg["status"] = isSpeaking

            try {
                val jsonObject = JSONObject(vadMsg as Map<*, *>)
                val jsonString = jsonObject.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                Log.e(TAG, "Error sending VAD status", e)
            }
        }

        /** Send battery status */
        @JvmStatic
        fun sendBatteryStatus(level: Int, charging: Boolean) {
            val vadMsg = HashMap<String, Any>()
            vadMsg["type"] = "glasses_battery_update"
            vadMsg["level"] = level
            vadMsg["charging"] = charging
            vadMsg["timestamp"] = System.currentTimeMillis()
            // TODO: time remaining

            try {
                val jsonObject = JSONObject(vadMsg as Map<*, *>)
                val jsonString = jsonObject.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                Log.e(TAG, "Error sending battery status", e)
            }
        }

        /** Send discovered device */
        @JvmStatic
        fun sendDiscoveredDevice(modelName: String, deviceName: String) {
            val eventBody = HashMap<String, Any>()
            eventBody["model_name"] = modelName
            eventBody["device_name"] = deviceName
            sendTypedMessage("compatible_glasses_search_result", eventBody as Map<String, Any>)
        }

        /** Send glasses connection state */
        @JvmStatic
        fun sendGlassesConnectionState(modelName: String, status: String) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "glasses_connection_state"
                event["modelName"] = modelName
                event["status"] = status
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building glasses_connection_state JSON: $e")
            }
        }

        /** Update ASR config */
        @JvmStatic
        fun updateAsrConfig(languages: List<Map<String, Any>>) {
            try {
                val configMsg = HashMap<String, Any>()
                configMsg["type"] = "config"
                configMsg["streams"] = languages

                val jsonData = JSONObject(configMsg as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building config message: $e")
            }
        }

        /** Send core status */
        @JvmStatic
        fun sendCoreStatus(status: Map<String, Any>) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "core_status_update"
                val statusMap = HashMap<String, Any>()
                statusMap["status"] = status
                event["status"] = statusMap
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building core_status_update JSON: $e")
            }
        }

        // MARK: - Hardware Events

        /** Send button press */
        @JvmStatic
        fun sendButtonPress(buttonId: String, pressType: String) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "button_press"
                event["buttonId"] = buttonId
                event["pressType"] = pressType
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building button_press JSON: $e")
            }
        }

        /** Send photo response */
        @JvmStatic
        fun sendPhotoResponse(requestId: String, photoUrl: String) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "photo_response"
                event["requestId"] = requestId
                event["photoUrl"] = photoUrl
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building photo_response JSON: $e")
            }
        }

        /** Send video stream response */
        @JvmStatic
        fun sendVideoStreamResponse(appId: String, streamUrl: String) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "video_stream_response"
                event["appId"] = appId
                event["streamUrl"] = streamUrl
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error building video_stream_response JSON: $e")
            }
        }

        /** Send head position */
        @JvmStatic
        fun sendHeadPosition(isUp: Boolean) {
            try {
                val event = HashMap<String, Any>()
                event["type"] = "head_position"
                event["position"] = if (isUp) "up" else "down"
                event["timestamp"] = System.currentTimeMillis().toInt()

                val jsonData = JSONObject(event as Map<*, *>)
                val jsonString = jsonData.toString()
                sendWSText(jsonString)
            } catch (e: Exception) {
                log("ServerComms: Error sending head position: $e")
            }
        }

        /**
         * Send transcription result to server Used by AOSManager to send pre-formatted
         * transcription results Matches the Swift structure exactly
         */
        @JvmStatic
        fun sendLocalTranscription(transcription: Map<String, Any>) {
            val text = transcription["text"] as? String
            if (text == null || text.isEmpty()) {
                log("Skipping empty transcription result")
                return
            }

            sendTypedMessage("local_transcription", transcription)
        }

        // Core bridge funcs:

        /** Send status update */
        @JvmStatic
        fun sendStatus(statusObj: Map<String, Any>) {
            val body = HashMap<String, Any>()
            body["status"] = statusObj
            sendTypedMessage("status", body as Map<String, Any>)
        }

        /** Send glasses serial number */
        @JvmStatic
        fun sendGlassesSerialNumber(serialNumber: String, style: String, color: String) {
            val serialData = HashMap<String, Any>()
            serialData["serial_number"] = serialNumber
            serialData["style"] = style
            serialData["color"] = color

            val body = HashMap<String, Any>()
            body["glasses_serial_number"] = serialData
            sendTypedMessage("glasses_serial_number", body as Map<String, Any>)
        }

        /** Send WiFi status change */
        @JvmStatic
        fun sendWifiStatusChange(connected: Boolean, ssid: String?, localIp: String?) {
            val event = HashMap<String, Any?>()
            event["connected"] = connected
            event["ssid"] = ssid
            event["local_ip"] = localIp
            sendTypedMessage("wifi_status_change", event as Map<String, Any>)
        }

        /** Send WiFi scan results */
        @JvmStatic
        fun sendWifiScanResults(networks: List<Map<String, Any>>) {
            val eventBody = HashMap<String, Any>()
            eventBody["networks"] = networks
            sendTypedMessage("wifi_scan_results", eventBody as Map<String, Any>)
        }

        /** Send gallery status - matches iOS MentraLive.swift handleGalleryStatus pattern */
        @JvmStatic
        fun sendGalleryStatus(
                photoCount: Int,
                videoCount: Int,
                totalCount: Int,
                totalSize: Long,
                hasContent: Boolean
        ) {
            val galleryData = HashMap<String, Any>()
            galleryData["photos"] = photoCount
            galleryData["videos"] = videoCount
            galleryData["total"] = totalCount
            galleryData["total_size"] = totalSize
            galleryData["has_content"] = hasContent

            val eventBody = HashMap<String, Any>()
            eventBody["glasses_gallery_status"] = galleryData

            sendTypedMessage("glasses_gallery_status", eventBody as Map<String, Any>)
        }

        /** Send hotspot status change - matches iOS MentraLive.swift emitHotspotStatusChange */
        @JvmStatic
        fun sendHotspotStatusChange(
                enabled: Boolean,
                ssid: String,
                password: String,
                gatewayIp: String
        ) {
            val eventBody = HashMap<String, Any>()
            eventBody["enabled"] = enabled
            eventBody["ssid"] = ssid
            eventBody["password"] = password
            eventBody["local_ip"] = gatewayIp // Using gateway IP for consistency with iOS

            sendTypedMessage("hotspot_status_change", eventBody as Map<String, Any>)
        }

        /** Send version info - matches iOS MentraLive.swift emitVersionInfo */
        @JvmStatic
        fun sendVersionInfo(
                appVersion: String,
                buildNumber: String,
                deviceModel: String,
                androidVersion: String,
                otaVersionUrl: String
        ) {
            val eventBody = HashMap<String, Any>()
            eventBody["app_version"] = appVersion
            eventBody["build_number"] = buildNumber
            eventBody["device_model"] = deviceModel
            eventBody["android_version"] = androidVersion
            eventBody["ota_version_url"] = otaVersionUrl

            sendTypedMessage("version_info", eventBody as Map<String, Any>)
        }

        /** Send RTMP stream status - forwards to websocket system (matches iOS) */
        @JvmStatic
        fun sendRtmpStreamStatus(statusJson: Map<String, Any>) {
            sendTypedMessage("rtmp_stream_status", statusJson)
        }

        /** Send keep alive ACK - forwards to websocket system (matches iOS) */
        @JvmStatic
        fun sendKeepAliveAck(ackJson: Map<String, Any>) {
            sendTypedMessage("keep_alive_ack", ackJson)
        }

        /** Send IMU data event - matches iOS MentraLive.swift emitImuDataEvent */
        @JvmStatic
        fun sendImuDataEvent(
                accel: DoubleArray,
                gyro: DoubleArray,
                mag: DoubleArray,
                quat: DoubleArray,
                euler: DoubleArray,
                timestamp: Long
        ) {
            val eventBody = HashMap<String, Any>()
            eventBody["accel"] = accel.toList()
            eventBody["gyro"] = gyro.toList()
            eventBody["mag"] = mag.toList()
            eventBody["quat"] = quat.toList()
            eventBody["euler"] = euler.toList()
            eventBody["timestamp"] = timestamp

            sendTypedMessage("imu_data_event", eventBody as Map<String, Any>)
        }

        /** Send IMU gesture event - matches iOS MentraLive.swift emitImuGestureEvent */
        @JvmStatic
        fun sendImuGestureEvent(gesture: String, timestamp: Long) {
            val eventBody = HashMap<String, Any>()
            eventBody["gesture"] = gesture
            eventBody["timestamp"] = timestamp

            sendTypedMessage("imu_gesture_event", eventBody as Map<String, Any>)
        }

        /** Get supported events Don't add to this list, use a typed message instead */
        @JvmStatic
        fun getSupportedEvents(): Array<String> {
            return arrayOf("CoreMessageEvent")
        }

        // Arbitrary WS Comms (don't use these, make a dedicated function for your use case):

        /** Send WebSocket text message */
        @JvmStatic
        fun sendWSText(msg: String) {
            val data = HashMap<String, Any>()
            data["text"] = msg
            sendTypedMessage("ws_text", data as Map<String, Any>)
        }

        /** Send WebSocket binary message */
        @JvmStatic
        fun sendWSBinary(data: ByteArray) {
            val base64String = Base64.encodeToString(data, Base64.NO_WRAP)
            val body = HashMap<String, Any>()
            body["base64"] = base64String
            sendTypedMessage("ws_bin", body as Map<String, Any>)
        }

        /**
         * Send a typed message to React Native Don't call this function directly, instead make a
         * function above that calls this function
         */
        @JvmStatic
        private fun sendTypedMessage(type: String, body: Map<String, Any>) {
            var mutableBody = body
            if (body !is HashMap) {
                mutableBody = HashMap(body)
            }
            (mutableBody as HashMap<String, Any>)["type"] = type

            try {
                val jsonData = JSONObject(mutableBody as Map<*, *>)
                val jsonString = jsonData.toString()

                if (reactContext != null && reactContext!!.hasActiveCatalystInstance()) {
                    // Lazily get the emitter when needed
                    if (emitter == null) {
                        emitter =
                                reactContext!!.getJSModule(
                                        DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                                )
                    }
                    if (emitter != null) {
                        emitter!!.emit("CoreMessageEvent", jsonString)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending typed message", e)
            }
        }

        /**
         * Send event with WritableMap (for complex objects) Used by other modules that need to send
         * structured data
         */
        @JvmStatic
        fun sendEventWithMap(eventName: String, params: WritableMap) {
            if (reactContext != null && reactContext!!.hasActiveCatalystInstance()) {
                // Lazily get the emitter when needed
                if (emitter == null) {
                    emitter =
                            reactContext!!.getJSModule(
                                    DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
                            )
                }
                if (emitter != null) {
                    emitter!!.emit(eventName, params)
                }
            }
        }

        /** Convert Map to WritableMap for React Native */
        @JvmStatic
        fun mapToWritableMap(map: Map<String, Any>?): WritableMap {
            val writableMap = Arguments.createMap()

            if (map == null) {
                return writableMap
            }

            for ((key, value) in map) {
                when {
                    value is Boolean -> writableMap.putBoolean(key, value)
                    value is Int -> writableMap.putInt(key, value)
                    value is Double -> writableMap.putDouble(key, value)
                    value is Float -> writableMap.putDouble(key, value.toDouble())
                    value is String -> writableMap.putString(key, value)
                    value is Map<*, *> ->
                            writableMap.putMap(key, mapToWritableMap(value as Map<String, Any>))
                    else -> writableMap.putString(key, value.toString())
                }
            }

            return writableMap
        }

        @JvmStatic
        fun getContext(): ReactApplicationContext {
            return reactContext!!
        }
    }

    init {
        mentraManager = MentraManager.Companion.getInstance()
        if (mentraManager == null) {
            Log.e(TAG, "Failed to initialize MentraManager in Bridge constructor")
        }
    }

    /**
     * Handle commands from the mantle
     * @param command JSON string containing the command and parameters
     * @return Object result of the command execution (can be boolean, string, int, etc.)
     */
    fun handleCommand(command: String): Any {
        // log("CommandBridge: Received command: $command")

        // Ensure mentraManager is initialized
        if (mentraManager == null) {
            Log.w(TAG, "MentraManager was null in handleCommand, attempting to initialize")
            mentraManager = MentraManager.Companion.getInstance()
            if (mentraManager == null) {
                Log.e(TAG, "Failed to initialize MentraManager in handleCommand")
                return "Error: MentraManager not available"
            }
        }

        val m = mentraManager!!

        try {
            val jsonCommand = JSONObject(command)
            val commandString = jsonCommand.getString("command")
            val params = jsonCommand.optJSONObject("params")

            when (commandString) {
                "display_event" -> {
                    if (params == null) {
                        log("CommandBridge: display_event invalid params")
                        return 0
                    }
                    val displayEvent = jsonObjectToMap(params)
                    m.handle_display_event(displayEvent)
                }
                "display_text" -> {
                    if (params == null) {
                        log("CommandBridge: display_text invalid params")
                        return 0
                    }
                    m.handle_display_text(jsonObjectToMap(params))
                }
                "request_status" -> {
                    m.handle_request_status()
                }
                "connect_default" -> {
                    m.handle_connect_default()
                }
                "connect_by_name" -> {
                    if (params != null) {
                        val deviceName = params.optString("device_name", "")
                        m.handle_connect_by_name(deviceName)
                    }
                }
                "disconnect" -> {
                    m.handle_disconnect()
                }
                "forget" -> {
                    m.handle_forget()
                }
                "find_compatible_devices" -> {
                    if (params != null) {
                        val modelName = params.getString("model_name")
                        m.handle_find_compatible_devices(modelName)
                    }
                }
                "show_dashboard" -> {
                    m.handle_show_dashboard()
                }
                "request_wifi_scan" -> {
                    m.handle_request_wifi_scan()
                }
                "send_wifi_credentials" -> {
                    if (params != null) {
                        val ssid = params.getString("ssid")
                        val password = params.getString("password")
                        m.handle_send_wifi_credentials(ssid, password)
                    }
                }
                "set_hotspot_state" -> {
                    if (params != null) {
                        val enabled = params.getBoolean("enabled")
                        m.handle_set_hotspot_state(enabled)
                    }
                }
                "query_gallery_status" -> {
                    Log.d(TAG, "Querying gallery status")
                    m.handle_query_gallery_status()
                }
                "photo_request" -> {
                    if (params != null) {
                        val requestId = params.getString("requestId")
                        val appId = params.getString("appId")
                        val size = params.getString("size")
                        val webhookUrl = params.optString("webhookUrl", null)
                        val authToken = params.optString("authToken", null)
                        m.handle_photo_request(requestId, appId, size, webhookUrl, authToken)
                    }
                }
                "start_buffer_recording" -> {
                    Log.d(TAG, "Starting buffer recording")
                    m.handle_start_buffer_recording()
                }
                "stop_buffer_recording" -> {
                    Log.d(TAG, "Stopping buffer recording")
                    m.handle_stop_buffer_recording()
                }
                "save_buffer_video" -> {
                    if (params != null) {
                        val requestId = params.getString("request_id")
                        val durationSeconds = params.getInt("duration_seconds")
                        Log.d(
                                TAG,
                                "Saving buffer video: requestId=$requestId, duration=${durationSeconds}s"
                        )
                        m.handle_save_buffer_video(requestId, durationSeconds)
                    }
                }
                "start_video_recording" -> {
                    if (params != null) {
                        val requestId = params.getString("request_id")
                        val save = params.getBoolean("save")
                        Log.d(TAG, "Starting video recording: requestId=$requestId, save=$save")
                        m.handle_start_video_recording(requestId, save)
                    }
                }
                "stop_video_recording" -> {
                    if (params != null) {
                        val requestId = params.getString("request_id")
                        Log.d(TAG, "Stopping video recording: requestId=$requestId")
                        m.handle_stop_video_recording(requestId)
                    }
                }
                "start_rtmp_stream" -> {
                    if (params == null) {
                        log("CommandBridge: start_rtmp_stream invalid params")
                        return 0
                    }
                    Log.d(TAG, "Starting RTMP stream")
                    // m.handle_start_rtmp_stream(jsonObjectToMap(params))
                }
                "stop_rtmp_stream" -> {
                    Log.d(TAG, "Stopping RTMP stream")
                    // m.handle_stop_rtmp_stream()
                }
                "keep_rtmp_stream_alive" -> {
                    if (params == null) {
                        log("CommandBridge: keep_rtmp_stream_alive invalid params")
                        return 0
                    }
                    Log.d(TAG, "RTMP stream keep alive")
                    // m.handle_keep_rtmp_stream_alive(jsonObjectToMap(params))
                }
                "set_stt_model_details" -> {
                    if (params != null) {
                        val path = params.getString("path")
                        val languageCode = params.getString("languageCode")
                        STTTools.setSttModelDetails(getContext(), path, languageCode)
                    }
                }
                "get_stt_model_path" -> {
                    return STTTools.getSttModelPath(getContext())
                }
                "check_stt_model_available" -> {
                    return STTTools.checkSTTModelAvailable(getContext())
                }
                "validate_stt_model" -> {
                    if (params != null) {
                        val path = params.getString("path")
                        return STTTools.validateSTTModel(path)
                    }
                    return false
                }
                "extract_tar_bz2" -> {
                    if (params != null) {
                        val sourcePath = params.getString("source_path")
                        val destinationPath = params.getString("destination_path")
                        return STTTools.extractTarBz2(sourcePath, destinationPath)
                    }
                    return false
                }
                "microphone_state_change" -> {
                    if (params != null) {
                        val bypassVad = params.optBoolean("bypassVad", false)
                        val requiredDataArray = params.optJSONArray("requiredData")
                        val requiredData = ArrayList<String>()

                        if (requiredDataArray != null) {
                            for (i in 0 until requiredDataArray.length()) {
                                try {
                                    val dataType = requiredDataArray.getString(i)
                                    requiredData.add(dataType)
                                } catch (e: JSONException) {
                                    Log.e(TAG, "Error parsing requiredData array", e)
                                }
                            }
                        }

                        Log.d(TAG, "requiredData = $requiredData, bypassVad = $bypassVad")
                        m.handle_microphone_state_change(requiredData, bypassVad)
                    }
                }
                "update_settings" -> {
                    if (params != null) {
                        val settings = jsonObjectToMap(params)
                        m.handle_update_settings(settings)
                    }
                }
                "restart_transcriber" -> {
                    m.restartTranscriber()
                }
                "toggle_enforce_local_transcription" -> {
                    if (params != null) {
                        val enabled = params.getBoolean("enabled")
                        m.updateEnforceLocalTranscription(enabled)
                    }
                }
                "ping" -> {
                    // Do nothing for ping
                }
                "unknown" -> {
                    Log.d(TAG, "Unknown command type: $commandString")
                    m.handle_request_status()
                }
                else -> {
                    Log.d(TAG, "Unknown command type: $commandString")
                    m.handle_request_status()
                }
            }
        } catch (e: JSONException) {
            Log.e(TAG, "Error parsing JSON command", e)
        }

        return 0
    }

    /** Convert JSONObject to Map recursively */
    @Throws(JSONException::class)
    private fun jsonObjectToMap(jsonObject: JSONObject?): Map<String, Any> {
        val map = HashMap<String, Any>()

        if (jsonObject == null) {
            return map
        }

        val keys = jsonObject.names()
        if (keys == null) {
            return map
        }

        for (i in 0 until keys.length()) {
            val key = keys.getString(i)
            val value = jsonObject.get(key)

            if (value is JSONObject) {
                map[key] = jsonObjectToMap(value)
            } else if (value is JSONArray) {
                map[key] = jsonArrayToList(value)
            } else if (value == JSONObject.NULL) {
                // Skip null values instead of adding them
            } else {
                map[key] = value
            }
        }

        return map
    }

    /** Convert JSONArray to List recursively */
    @Throws(JSONException::class)
    private fun jsonArrayToList(jsonArray: JSONArray?): List<Any> {
        val list = ArrayList<Any>()

        if (jsonArray == null) {
            return list
        }

        for (i in 0 until jsonArray.length()) {
            val value = jsonArray.get(i)

            if (value is JSONObject) {
                list.add(jsonObjectToMap(value))
            } else if (value is JSONArray) {
                list.add(jsonArrayToList(value))
            } else if (value == JSONObject.NULL) {
                // Skip null values
            } else {
                list.add(value)
            }
        }

        return list
    }
}
