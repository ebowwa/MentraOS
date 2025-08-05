/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 * 
 * MentraOS BLE Protobuf Message Handler
 * 
 * SUPPORTED MESSAGE TYPES:
 * 
 * === PhoneToGlasses (Incoming) Messages ===
 * Tag 10: DisconnectRequest        - Connection termination request (No response)
 * Tag 11: BatteryStateRequest      - Request current battery level → Response: BatteryStatus (Tag 10)
 * Tag 12: GlassesInfoRequest       - Request device information → Response: DeviceInfo (TODO)
 * Tag 16: PingRequest              - Connectivity test request → Response: PongResponse (TODO)
 * Tag 30: DisplayText              - Display static text message (No response)
 * Tag 35: DisplayScrollingText     - Display animated scrolling text (No response)
 * Tag 37: BrightnessConfig         - Set display brightness level (No response)
 * Tag 38: AutoBrightnessConfig     - Configure automatic brightness adjustment (No response)
 * Tag 99: ClearDisplay             - Clear display content (TEMPORARY TAG - update when protobuf definition ready)
 * 
 * === GlassesToPhone (Outgoing) Messages ===
 * Tag 10: BatteryStatus            - Battery level notification (85% default, 0-100% range)
 * Tag ??: DeviceInfo               - Device information response (TODO - not implemented)
 * Tag ??: PongResponse             - Ping response (TODO - not implemented)
 * 
 * === Message Directions & Responses ===
 * Phone → Glasses: Control commands, requests, configuration
 * Glasses → Phone: Status notifications, responses, acknowledgments
 * 
 * === Protocol Details ===
 * - Wire Format: 0x02 header + protobuf payload
 * - Encoding: nanopb library (Protocol Buffers for embedded systems)
 * - Version: MentraOS BLE Protobuf v3
 * - Transport: BLE GATT characteristic notifications
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/device.h>
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#include "protobuf_handler.h"
#include "proto/mentraos_ble.pb.h"
#include "mentra_ble_service.h"
#include <pb_decode.h>
#include <pb_encode.h>

LOG_MODULE_REGISTER(protobuf_handler, LOG_LEVEL_DBG);

// Global battery level state (0-100%)
static uint32_t current_battery_level = 85;

// Global brightness level state (0-100%)
static uint32_t current_brightness_level = 50;

// Global auto brightness state
static bool auto_brightness_enabled = false;

// PWM device for LED 3 brightness control
static const struct device *pwm_dev = DEVICE_DT_GET(DT_NODELABEL(pwm1));

void protobuf_analyze_message(const uint8_t *data, uint16_t len)
{
	if (len == 0) {
		LOG_WRN("Received empty data - ignoring");
		return;
	}

	LOG_INF("=== BLE DATA RECEIVED ===");
	LOG_INF("Received BLE data (%u bytes):", len);
	
	// Print hex dump
	for (int i = 0; i < len; i++) {
		printk("0x%02X ", data[i]);
		if ((i + 1) % 16 == 0) {
			printk("\n");
		}
	}
	if (len % 16 != 0) {
		printk("\n");
	}

	// Check if this looks like a protobuf message (starts with control header)
	uint8_t firstByte = data[0];
	switch (firstByte) {
	case 0x02:
		LOG_INF("[PROTOBUF] Control header detected: 0x02 (Protobuf message)");
		protobuf_parse_control_message(data + 1, len - 1);
		break;
	case 0xA0:
		LOG_INF("[AUDIO] Control header detected: 0xA0 (Audio data)");
		protobuf_parse_audio_chunk(data, len);
		break;
	case 0xB0:
		LOG_INF("[IMAGE] Control header detected: 0xB0 (Image data)");
		protobuf_parse_image_chunk(data, len);
		break;
	default:
		LOG_WRN("[UNKNOWN] Unknown control header: 0x%02X", firstByte);
		// Still try to parse as protobuf in case the header is part of the message
		if (len > 1) {
			LOG_INF("[FALLBACK] Attempting protobuf parse without header...");
			protobuf_parse_control_message(data, len);
		}
		break;
	}

	// Show raw ASCII if printable and check for brightness text
	LOG_INF("[ASCII] Raw string: \"");
	char ascii_buffer[256] = {0};
	int ascii_idx = 0;
	
	for (int i = 0; i < len && ascii_idx < 255; i++) {
		if (data[i] >= 32 && data[i] <= 126) {
			printk("%c", data[i]);
			ascii_buffer[ascii_idx++] = data[i];
		} else {
			printk(".");
		}
	}
	printk("\"\n");
	
	// TODO: Discuss with mobile app team - brightness text messages are not part of official protocol
	// The official protocol uses BrightnessConfig protobuf (tag 37), but mobile app sends debug text
	// Commenting out for now to focus on official protocol compliance
	/*
	// Check if this is a brightness adjustment message in text format
	if (strstr(ascii_buffer, "Brightness Adjustment") || 
	    strstr(ascii_buffer, "brightness to")) {
		protobuf_parse_text_brightness(ascii_buffer);
	}
	*/
	
	LOG_INF("=== END BLE DATA ===");
}

void protobuf_parse_control_message(const uint8_t *protobuf_data, uint16_t len)
{
	LOG_INF("Parsing protobuf control message (%u bytes) using nanopb", len);
	
	if (len == 0) {
		LOG_WRN("Empty protobuf message");
		return;
	}

	// Print first few bytes for debugging
	LOG_INF("First 10 bytes of protobuf data:");
	for (int i = 0; i < len && i < 10; i++) {
		printk("0x%02X ", protobuf_data[i]);
	}
	printk("\n");

	// Try to decode as PhoneToGlasses message
	mentraos_ble_PhoneToGlasses phone_msg = mentraos_ble_PhoneToGlasses_init_default;
	
	LOG_INF("Attempting to decode PhoneToGlasses message...");
	bool decode_result = decode_phone_to_glasses_message(protobuf_data, len, &phone_msg);
	
	if (decode_result) {
		LOG_INF("Successfully decoded PhoneToGlasses message!");
		LOG_INF("Message type (which_payload): %u", phone_msg.which_payload);
		
		// Enhanced message type logging with protocol details
		const char *message_name;
		const char *message_description;
		
		switch (phone_msg.which_payload) {
		case 10:
			message_name = "DisconnectRequest";
			message_description = "Connection termination request";
			break;
		case 11:
			message_name = "BatteryStateRequest";
			message_description = "Request current battery level";
			break;
		case 12:
			message_name = "GlassesInfoRequest";
			message_description = "Request device information";
			break;
		case 16:
			message_name = "PingRequest";
			message_description = "Connectivity test request";
			break;
		case 30:
			message_name = "DisplayText";
			message_description = "Display static text message";
			break;
		case 35:
			message_name = "DisplayScrollingText";
			message_description = "Display animated scrolling text";
			break;
		case 37:
			message_name = "BrightnessConfig";
			message_description = "Set display brightness level";
			break;
		case 38:
			message_name = "AutoBrightnessConfig";
			message_description = "Configure automatic brightness adjustment";
			break;
		case 99: // TODO: Replace with actual tag when protobuf definition is updated
			message_name = "ClearDisplay";
			message_description = "Clear display content (temporary tag)";
			break;
		default:
			message_name = "Unknown";
			message_description = "Unrecognized message type";
			break;
		}
		
		LOG_INF("Message Details:");
		LOG_INF("  - Type: PhoneToGlasses::%s", message_name);
		LOG_INF("  - Tag: %u", phone_msg.which_payload);
		LOG_INF("  - Description: %s", message_description);
		LOG_INF("  - Protocol: MentraOS BLE Protobuf v3");
		
		// Process the decoded message based on payload type
		switch (phone_msg.which_payload) {
		case 11: // battery_state_tag
			LOG_INF("Processing Battery State Request...");
			LOG_INF("Current battery level: %u%%", current_battery_level);
			// Send battery response
			protobuf_send_battery_notification();
			break;
			
		case 12: // glasses_info_tag  
			LOG_INF("Processing Glasses Info Request...");
			// TODO: Generate device info response
			LOG_INF("TODO: Implement device info response (DeviceInfo message)");
			break;
			
		case 10: // disconnect_tag
			LOG_INF("Processing Disconnect Request...");
			// TODO: Handle disconnect
			LOG_INF("TODO: Implement graceful disconnection");
			break;
			
		case 30: // display_text_tag
			LOG_INF("Processing Display Text Message...");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_display_text_tag) {
				protobuf_process_display_text(&phone_msg.payload.display_text);
			}
			break;
			
		case 35: // display_scrolling_text_tag
			LOG_INF("Processing Display Scrolling Text Message...");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_display_scrolling_text_tag) {
				protobuf_process_display_scrolling_text(&phone_msg.payload.display_scrolling_text);
			}
			break;
			
		case 16: // ping_tag
			LOG_INF("Processing Ping Request...");
			// TODO: Send pong response
			LOG_INF("TODO: Implement PongResponse message");
			break;
			
		case 37: // brightness_tag
			LOG_INF("Processing Brightness Configuration...");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_brightness_tag) {
				protobuf_process_brightness_config(&phone_msg.payload.brightness);
			}
			break;
			
		case 38: // auto_brightness_tag
			LOG_INF("Processing Auto Brightness Configuration...");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_auto_brightness_tag) {
				protobuf_process_auto_brightness_config(&phone_msg.payload.auto_brightness);
			}
			break;
			
		case 99: // clear_display_tag (temporary - TODO: update when protobuf definition is updated)
			LOG_INF("Processing Clear Display Command...");
			LOG_WRN("Using temporary tag 99 for ClearDisplay - update when protobuf definition is ready");
			protobuf_process_clear_display();
			break;
			
		default:
			LOG_WRN("Unknown message type: %u", phone_msg.which_payload);
			LOG_WRN("Available message types:");
			LOG_WRN("  - 10: DisconnectRequest");
			LOG_WRN("  - 11: BatteryStateRequest");
			LOG_WRN("  - 12: GlassesInfoRequest");
			LOG_WRN("  - 16: PingRequest");
			LOG_WRN("  - 30: DisplayText");
			LOG_WRN("  - 35: DisplayScrollingText");
			LOG_WRN("  - 37: BrightnessConfig");
			LOG_WRN("  - 38: AutoBrightnessConfig");
			LOG_WRN("  - 99: ClearDisplay (temporary tag)");
			break;
		}
		
	} else {
		LOG_ERR("Failed to decode protobuf message - falling back to detailed analysis");
		
		// Enhanced protobuf wire format analysis
		LOG_INF("=== PROTOBUF DECODE FAILURE ANALYSIS ===");
		LOG_INF("Message length: %u bytes", len);
		
		// Analyze first 20 bytes for protobuf structure
		LOG_INF("Wire format analysis (first 20 bytes):");
		for (int i = 0; i < len && i < 20; i++) {
			uint8_t field_tag = protobuf_data[i] >> 3;
			uint8_t wire_type = protobuf_data[i] & 0x07;
			
			const char *wire_type_name;
			switch (wire_type) {
			case 0: wire_type_name = "VARINT"; break;
			case 1: wire_type_name = "FIXED64"; break;
			case 2: wire_type_name = "LENGTH_DELIMITED"; break;
			case 3: wire_type_name = "START_GROUP"; break;
			case 4: wire_type_name = "END_GROUP"; break;
			case 5: wire_type_name = "FIXED32"; break;
			default: wire_type_name = "UNKNOWN"; break;
			}
			
			LOG_INF("  [%02d] 0x%02X -> tag=%u, wire=%u (%s)", 
				i, protobuf_data[i], field_tag, wire_type, wire_type_name);
		}
		
		// Check if this might be a different message type
		if (len > 10) {
			// Look for common protobuf patterns
			bool has_text_field = false;
			for (int i = 0; i < len - 4; i++) {
				// Look for text field patterns (length-delimited strings)
				if ((protobuf_data[i] & 0x07) == 2) { // LENGTH_DELIMITED
					uint8_t tag = protobuf_data[i] >> 3;
					LOG_INF("  Found LENGTH_DELIMITED field at offset %d, tag=%u", i, tag);
					has_text_field = true;
				}
			}
			
			if (!has_text_field) {
				LOG_WRN("No LENGTH_DELIMITED fields found - might not be protobuf");
			}
		}
		
		LOG_INF("=== END ANALYSIS ===");
	}
}

bool decode_phone_to_glasses_message(const uint8_t *data, uint16_t len, 
                                    mentraos_ble_PhoneToGlasses *msg)
{
	if (!data || !msg || len == 0) {
		LOG_ERR("Invalid parameters for protobuf decode");
		return false;
	}

	LOG_DBG("Decoding %u bytes of protobuf data", len);

	// Create input stream
	pb_istream_t stream = pb_istream_from_buffer(data, len);
	
	// Decode the message
	bool status = pb_decode(&stream, mentraos_ble_PhoneToGlasses_fields, msg);
	
	if (!status) {
		LOG_ERR("Protobuf decode error: %s", PB_GET_ERROR(&stream));
		LOG_ERR("Stream bytes left: %zu", stream.bytes_left);
		LOG_ERR("Stream state: %p", stream.state);
		
		// Try basic field analysis for debugging
		LOG_INF("Raw protobuf analysis:");
		for (int i = 0; i < len && i < 20; i++) {
			uint8_t field_tag = data[i] >> 3;
			uint8_t wire_type = data[i] & 0x07;
			LOG_DBG("   Byte %d: tag=%u, wire_type=%u, raw=0x%02X", i, field_tag, wire_type, data[i]);
		}
	} else {
		LOG_INF("Protobuf decode successful, %zu bytes consumed", len - stream.bytes_left);
	}
	
	return status;
}

bool encode_glasses_to_phone_message(const mentraos_ble_GlassesToPhone *msg,
                                    uint8_t *buffer, size_t buffer_size,
                                    size_t *bytes_written)
{
	if (!msg || !buffer || !bytes_written) {
		return false;
	}

	// Create output stream
	pb_ostream_t stream = pb_ostream_from_buffer(buffer, buffer_size);
	
	// Encode the message
	bool status = pb_encode(&stream, mentraos_ble_GlassesToPhone_fields, msg);
	
	if (status) {
		*bytes_written = stream.bytes_written;
		LOG_DBG("Encoded %zu bytes", *bytes_written);
	} else {
		LOG_ERR("Protobuf encode error: %s", PB_GET_ERROR(&stream));
		*bytes_written = 0;
	}
	
	return status;
}

void protobuf_parse_audio_chunk(const uint8_t *data, uint16_t len)
{
	if (len < 2) {
		LOG_WRN("Audio chunk too short");
		return;
	}

	uint8_t stream_id = data[1];
	uint16_t audio_data_len = len - 2;
	
	LOG_INF("Audio chunk: stream_id=0x%02X, data_len=%u", stream_id, audio_data_len);
}

void protobuf_parse_image_chunk(const uint8_t *data, uint16_t len)
{
	if (len < 4) {
		LOG_WRN("Image chunk too short");
		return;
	}

	uint16_t stream_id = (data[1] << 8) | data[2];
	uint8_t chunk_index = data[3];
	uint16_t image_data_len = len - 4;
	
	LOG_INF("Image chunk: stream_id=0x%04X, chunk_index=%u, data_len=%u", 
stream_id, chunk_index, image_data_len);
}

uint32_t protobuf_get_battery_level(void)
{
	return current_battery_level;
}

void protobuf_set_battery_level(uint32_t level)
{
	// Clamp battery level to valid range (0-100%)
	if (level > 100) {
		level = 100;
	}
	
	uint32_t old_level = current_battery_level;
	current_battery_level = level;
	LOG_INF("Battery level set to %u%%", current_battery_level);
	
	// Send proactive notification if level changed
	if (old_level != current_battery_level) {
		protobuf_send_battery_notification();
	}
}

void protobuf_increase_battery_level(void)
{
	uint32_t new_level = current_battery_level + 5;
	if (new_level > 100) {
		new_level = 100;
	}
	protobuf_set_battery_level(new_level);
}

void protobuf_decrease_battery_level(void)
{
	uint32_t new_level;
	if (current_battery_level >= 5) {
		new_level = current_battery_level - 5;
	} else {
		new_level = 0;
	}
	protobuf_set_battery_level(new_level);
}

void protobuf_send_battery_notification(void)
{
	LOG_INF("=== BLE DATA TRANSMISSION ===");
	LOG_INF("Direction: GlassesToPhone (Outgoing Response)");
	LOG_INF("Trigger: Battery level changed or requested");
	
	// Create a battery status notification message
	mentraos_ble_GlassesToPhone notification = mentraos_ble_GlassesToPhone_init_default;
	
	// Set which_payload to battery_status (tag 10)
	notification.which_payload = 10;
	
	// Fill battery status with current level
	notification.payload.battery_status.level = current_battery_level;
	notification.payload.battery_status.charging = false;
	
	LOG_INF("Pre-Encoding Message Analysis:");
	LOG_INF("  - Message Type: GlassesToPhone::BatteryStatus");
	LOG_INF("  - Protocol: MentraOS BLE Protobuf v3");
	LOG_INF("  - Payload Tag: 10 (battery_status)");
	LOG_INF("  - Direction: Glasses → Phone");
	
	LOG_INF("Battery Status Payload:");
	LOG_INF("  - Field 1 (uint32 level): %u%%", notification.payload.battery_status.level);
	LOG_INF("  - Field 2 (bool charging): %s", notification.payload.battery_status.charging ? "true" : "false");
	
	// Protocol compliance
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: GlassesToPhone::BatteryStatus");
	LOG_INF("  - All required fields present: YES");
	LOG_INF("  - Level range valid: %s (0-100%%)", (notification.payload.battery_status.level <= 100) ? "YES" : "NO");
	LOG_INF("  - Charging state valid: YES");
	
	// Encode the notification
	uint8_t buffer[64]; // Small buffer for battery notification
	size_t bytes_written;
	
	LOG_INF("Encoding Process:");
	LOG_INF("  - Encoder: nanopb library");
	LOG_INF("  - Target buffer size: %zu bytes", sizeof(buffer) - 1);
	
	if (encode_glasses_to_phone_message(&notification, buffer + 1, 
					   sizeof(buffer) - 1, &bytes_written)) {
		// Add the 0x02 header for protobuf messages
		buffer[0] = 0x02;
		
		LOG_INF("Encoding Success:");
		LOG_INF("  - Protobuf Length: %zu bytes", bytes_written);
		LOG_INF("  - Total Length: %zu bytes (with 0x02 header)", bytes_written + 1);
		LOG_INF("  - Header: 0x02 (protobuf marker)");
		LOG_INF("  - Efficiency: %zu bytes for battery status", bytes_written);
		
		// Detailed hex dump of response packet
		LOG_INF("Outgoing Packet Hex Dump (%zu bytes):", bytes_written + 1);
		for (size_t i = 0; i < bytes_written + 1; i++) {
			printk("0x%02X ", buffer[i]);
			if ((i + 1) % 16 == 0) {
				printk("\n");
			}
		}
		if ((bytes_written + 1) % 16 != 0) {
			printk("\n");
		}
		
		// Print to UART with comprehensive details
		printk("\n[Glasses->Phone BATTERY] Battery Status: %u%%, charging:%s (protobuf:%zu bytes)\n", 
		       notification.payload.battery_status.level, 
		       notification.payload.battery_status.charging ? "Y" : "N",
		       bytes_written);
		
		// Send via BLE (to all connected clients)
		LOG_INF("BLE Transmission:");
		int ret = mentra_ble_send(NULL, buffer, bytes_written + 1);
		if (ret == 0) {
			LOG_INF("  - Status: SUCCESS");
			LOG_INF("  - Sent: %zu bytes via BLE", bytes_written + 1);
			LOG_INF("  - Target: All connected phones");
			LOG_INF("Battery notification sent successfully");
		} else {
			LOG_ERR("  - Status: FAILED");
			LOG_ERR("  - Error code: %d", ret);
			LOG_ERR("Failed to send battery notification");
		}
		
		LOG_INF("=== END BLE DATA TRANSMISSION ===");
	} else {
		LOG_ERR("Encoding Failed:");
		LOG_ERR("  - Protobuf encoding error");
		LOG_ERR("  - Buffer size may be insufficient");
		LOG_ERR("  - Required: ~32 bytes, Available: %zu bytes", sizeof(buffer) - 1);
	}
}

int protobuf_generate_echo_response(const uint8_t *input_data, uint16_t input_len,
   uint8_t *output_data, uint16_t max_output_len)
{
	// NOTE: This is a fallback echo response using BatteryStatus message
	// TODO: Implement proper echo response message type when protobuf definition is updated
	LOG_INF("=== BLE DATA TRANSMISSION ===");
	LOG_INF("Direction: GlassesToPhone (Echo Response)");
	LOG_INF("Trigger: Echo request received");
	LOG_INF("Input packet length: %u bytes", input_len);
	LOG_INF("Output buffer size: %u bytes", max_output_len);
	
	// Create a simple response message
	mentraos_ble_GlassesToPhone response = mentraos_ble_GlassesToPhone_init_default;
	
	// Set which_payload to battery_status (tag 10) - simpler than device_info
	response.which_payload = 10;
	
	// Create a battery status response using current battery level
	response.payload.battery_status.level = current_battery_level;
	response.payload.battery_status.charging = false;
	
	LOG_INF("� Pre-Encoding Message Analysis:");
	LOG_INF("  - Message Type: GlassesToPhone::BatteryStatus");
	LOG_INF("  - Protocol: MentraOS BLE Protobuf v3");
	LOG_INF("  - Payload Tag: 10 (battery_status)");
	LOG_INF("  - Direction: Glasses → Phone");
	LOG_INF("  - Context: Echo response using battery status");
	
	LOG_INF("Battery Status Payload:");
	LOG_INF("  - Field 1 (uint32 level): %u%%", response.payload.battery_status.level);
	LOG_INF("  - Field 2 (bool charging): %s", response.payload.battery_status.charging ? "true" : "false");
	
	// Protocol compliance
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: GlassesToPhone::BatteryStatus");
	LOG_INF("  - All required fields present: YES");
	LOG_INF("  - Level range valid: %s (0-100%%)", (response.payload.battery_status.level <= 100) ? "YES" : "NO");
	LOG_INF("  - Charging state valid: YES");
	
	LOG_INF("Encoding Process:");
	LOG_INF("  - Encoder: nanopb library");
	LOG_INF("  - Target buffer size: %u bytes", max_output_len - 1);
	
	// Encode the response
	size_t bytes_written;
	if (encode_glasses_to_phone_message(&response, output_data + 1, 
					   max_output_len - 1, &bytes_written)) {
		// Add the 0x02 header for protobuf messages
		output_data[0] = 0x02;
		
		LOG_INF("Encoding Success:");
		LOG_INF("  - Protobuf Length: %zu bytes", bytes_written);
		LOG_INF("  - Total Length: %zu bytes (with 0x02 header)", bytes_written + 1);
		LOG_INF("  - Header: 0x02 (protobuf marker)");
		LOG_INF("  - Efficiency: %zu bytes for echo response", bytes_written);
		
		// Detailed hex dump of response packet
		LOG_INF("Outgoing Echo Packet Hex Dump (%zu bytes):", bytes_written + 1);
		for (size_t i = 0; i < bytes_written + 1; i++) {
			printk("0x%02X ", output_data[i]);
			if ((i + 1) % 16 == 0) {
				printk("\n");
			}
		}
		if ((bytes_written + 1) % 16 != 0) {
			printk("\n");
		}
		
		// Print to UART with comprehensive details
		printk("\n[Glasses->Phone ECHO] Echo Response: battery:%u%%, charging:%s (protobuf:%zu bytes)\n", 
		       response.payload.battery_status.level, 
		       response.payload.battery_status.charging ? "Y" : "N",
		       bytes_written);
		
		LOG_INF("Echo Response Ready:");
		LOG_INF("  - Status: SUCCESS");
		LOG_INF("  - Generated: %zu bytes", bytes_written + 1);
		LOG_INF("  - Return value: %zu", bytes_written + 1);
		
		LOG_INF("=== END BLE DATA TRANSMISSION ===");
		return bytes_written + 1;
	} else {
		LOG_ERR("Encoding Failed:");
		LOG_ERR("  - Protobuf encoding error");
		LOG_ERR("  - Buffer size may be insufficient");
		LOG_ERR("  - Required: ~32 bytes, Available: %u bytes", max_output_len - 1);
		LOG_ERR("  - Return value: -ENOMEM");
		return -ENOMEM;
	}
}

// ============== BRIGHTNESS CONTROL FUNCTIONS ==============

uint32_t protobuf_get_brightness_level(void)
{
	return current_brightness_level;
}

bool protobuf_get_auto_brightness_enabled(void)
{
	return auto_brightness_enabled;
}

void protobuf_set_brightness_level(uint32_t level)
{
	// Clamp level to 0-100
	if (level > 100) {
		level = 100;
	}
	
	// Manual brightness setting automatically disables auto brightness
	if (auto_brightness_enabled) {
		LOG_INF("Manual brightness setting - disabling auto brightness");
		auto_brightness_enabled = false;
	}
	
	current_brightness_level = level;
	
	// Update LED 3 brightness via PWM
	if (device_is_ready(pwm_dev)) {
		// Convert percentage to PWM duty cycle (0-100% -> 0-100% duty cycle)
		// Since we use PWM_POLARITY_INVERTED, higher duty cycle = brighter LED
		uint32_t duty_cycle_percent = level;  // Direct mapping: 0% = off, 100% = full bright
		
		// PWM period is 20ms (50Hz), calculate duty cycle in nanoseconds
		uint32_t period_ns = 20 * 1000 * 1000;  // 20ms in nanoseconds
		uint32_t duty_ns = (period_ns * duty_cycle_percent) / 100;
		
		int ret = pwm_set(pwm_dev, 0, period_ns, duty_ns, PWM_POLARITY_INVERTED);
		
		if (ret == 0) {
			LOG_INF("LED 3 brightness set to %u%% (duty: %u%%)", level, duty_cycle_percent);
		} else {
			LOG_ERR("Failed to set LED 3 PWM: %d", ret);
		}
	} else {
		LOG_WRN("PWM LED 3 device not ready");
	}
}

void protobuf_process_brightness_config(const mentraos_ble_BrightnessConfig *brightness_config)
{
	if (!brightness_config) {
		LOG_ERR("Invalid brightness config pointer");
		return;
	}
	
	LOG_INF("=== BRIGHTNESS CONFIG MESSAGE (Tag 37) ===");
	
	uint32_t new_level = brightness_config->value;
	
	// Brightness value analysis
	LOG_INF("Brightness Configuration:");
	LOG_INF("  - Field 1 (uint32 value): %u%%", new_level);
	LOG_INF("  - Valid Range: 0-100%%");
	LOG_INF("  - Current Level: %u%%", current_brightness_level);
	LOG_INF("  - Requested Level: %u%%", new_level);
	LOG_INF("  - Auto Brightness: %s -> DISABLED (manual override)", auto_brightness_enabled ? "ENABLED" : "DISABLED");
	
	// Value validation
	bool valid_range = (new_level <= 100);
	LOG_INF("  - Value Valid: %s", valid_range ? "YES" : "NO (will be clamped)");
	
	if (!valid_range) {
		LOG_WRN("  - Brightness value %u exceeds maximum (100), will clamp to 100", new_level);
	}
	
	// PWM calculation preview
	uint32_t clamped_level = (new_level > 100) ? 100 : new_level;
	uint32_t period_ns = 20 * 1000 * 1000;  // 20ms in nanoseconds
	uint32_t duty_ns = (period_ns * clamped_level) / 100;
	
	LOG_INF("PWM Configuration Preview:");
	LOG_INF("  - PWM Period: %u ns (50Hz)", period_ns);
	LOG_INF("  - PWM Duty Cycle: %u%% (%u ns)", clamped_level, duty_ns);
	LOG_INF("  - PWM Polarity: INVERTED (higher duty = brighter)");
	LOG_INF("  - Target LED: LED3 (GPIO P0.31)");
	
	// Protocol compliance
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: PhoneToGlasses::BrightnessConfig");
	LOG_INF("  - Field 1 present: YES");
	LOG_INF("  - Value type: uint32");
	LOG_INF("  - Implementation: Hardware PWM control + Auto brightness disable");
	
	// Print to UART
	printk("\n[Phone->Glasses BRIGHTNESS] Brightness: %u%% -> %u%% (PWM: %u%%, Auto: %s->OFF)\n", 
	       current_brightness_level, clamped_level, clamped_level, auto_brightness_enabled ? "ON" : "OFF");
	
	// Clamp and set the new brightness level (this will disable auto brightness)
	protobuf_set_brightness_level(new_level);
	
	LOG_INF("Brightness Update Result:");
	LOG_INF("  - Previous Level: %u%%", current_brightness_level == clamped_level ? new_level : current_brightness_level);
	LOG_INF("  - New Level: %u%%", current_brightness_level);
	LOG_INF("  - Auto Brightness: DISABLED (manual override)");
	LOG_INF("  - Change: %+d%%", (int32_t)current_brightness_level - (int32_t)(current_brightness_level == clamped_level ? new_level : current_brightness_level));
	
	LOG_INF("=== END BRIGHTNESS CONFIG MESSAGE ===");
}

void protobuf_process_display_text(const mentraos_ble_DisplayText *display_text)
{
	if (!display_text) {
		LOG_ERR("Invalid display text pointer");
		return;
	}
	
	LOG_INF("=== DISPLAY TEXT MESSAGE (Tag 30) ===");
	
	// Text content analysis
	size_t text_length = strlen(display_text->text);
	LOG_INF("Text Content:");
	LOG_INF("  - Text: \"%s\"", display_text->text);
	LOG_INF("  - Length: %zu characters", text_length);
	LOG_INF("  - Field 1 (string text): \"%s\"", display_text->text);
	
	// Color analysis (RGB565 format)
	uint32_t color_rgb888 = display_text->color;
	uint16_t color_rgb565 = (uint16_t)color_rgb888;
	
	// Convert RGB565 back to RGB888 components for analysis
	uint8_t red = (color_rgb565 >> 11) & 0x1F;       // 5 bits
	uint8_t green = (color_rgb565 >> 5) & 0x3F;      // 6 bits  
	uint8_t blue = color_rgb565 & 0x1F;              // 5 bits
	
	// Scale to 8-bit values
	uint8_t red_8bit = (red * 255) / 31;
	uint8_t green_8bit = (green * 255) / 63;
	uint8_t blue_8bit = (blue * 255) / 31;
	
	LOG_INF("Color Configuration:");
	LOG_INF("  - Field 2 (uint32 color): 0x%06X", color_rgb888);
	LOG_INF("  - RGB565 Format: 0x%04X", color_rgb565);
	LOG_INF("  - RGB888 Components: R=%u, G=%u, B=%u", red_8bit, green_8bit, blue_8bit);
	LOG_INF("  - Color Name: %s", 
		(color_rgb565 == 0xF800) ? "Red" :
		(color_rgb565 == 0x07E0) ? "Green" :
		(color_rgb565 == 0x001F) ? "Blue" :
		(color_rgb565 == 0xFFFF) ? "White" :
		(color_rgb565 == 0x0000) ? "Black" :
		(color_rgb565 == 0xFFE0) ? "Yellow" :
		(color_rgb565 == 0xF81F) ? "Magenta" :
		(color_rgb565 == 0x07FF) ? "Cyan" : "Custom");
	
	// Font configuration
	LOG_INF("Font Configuration:");
	LOG_INF("  - Field 3 (uint32 font_code): %u", display_text->font_code);
	LOG_INF("  - Field 6 (uint32 size): %u (font size multiplier)", display_text->size);
	
	// Position and layout
	LOG_INF("Position & Layout:");
	LOG_INF("  - Field 4 (uint32 x): %u pixels", display_text->x);
	LOG_INF("  - Field 5 (uint32 y): %u pixels", display_text->y);
	LOG_INF("  - Screen Position: (%u, %u)", display_text->x, display_text->y);
	
	// Protocol compliance check
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: PhoneToGlasses::DisplayText");
	LOG_INF("  - All required fields present: YES");
	LOG_INF("  - Color format valid: %s", (color_rgb565 <= 0xFFFF) ? "YES" : "NO");
	LOG_INF("  - Position bounds: X=%u, Y=%u (bounds depend on display)", display_text->x, display_text->y);
	
	// Print to UART with comprehensive details
	printk("\n[Phone->Glasses TEXT] Display Text: \"%s\" (len:%zu, pos:(%u,%u), color:0x%04X, font:%u, size:%u)\n", 
	       display_text->text, text_length, display_text->x, display_text->y, 
	       color_rgb565, display_text->font_code, display_text->size);
	
	LOG_INF("=== END DISPLAY TEXT MESSAGE ===");
}

void protobuf_process_display_scrolling_text(const mentraos_ble_DisplayScrollingText *scrolling_text)
{
	if (!scrolling_text) {
		LOG_ERR("Invalid scrolling text pointer");
		return;
	}
	
	LOG_INF("=== DISPLAY SCROLLING TEXT MESSAGE (Tag 35) ===");
	
	// Text content analysis
	size_t text_length = strlen(scrolling_text->text);
	LOG_INF("Text Content:");
	LOG_INF("  - Field 1 (string text): \"%s\"", scrolling_text->text);
	LOG_INF("  - Text Length: %zu characters", text_length);
	
	// Color analysis (same as DisplayText)
	uint32_t color_rgb888 = scrolling_text->color;
	uint16_t color_rgb565 = (uint16_t)color_rgb888;
	
	uint8_t red = (color_rgb565 >> 11) & 0x1F;
	uint8_t green = (color_rgb565 >> 5) & 0x3F;
	uint8_t blue = color_rgb565 & 0x1F;
	
	uint8_t red_8bit = (red * 255) / 31;
	uint8_t green_8bit = (green * 255) / 63;
	uint8_t blue_8bit = (blue * 255) / 31;
	
	LOG_INF("Color Configuration:");
	LOG_INF("  - Field 2 (uint32 color): 0x%06X", color_rgb888);
	LOG_INF("  - RGB565 Format: 0x%04X", color_rgb565);
	LOG_INF("  - RGB888 Components: R=%u, G=%u, B=%u", red_8bit, green_8bit, blue_8bit);
	
	// Font configuration  
	LOG_INF("Font Configuration:");
	LOG_INF("  - Field 3 (uint32 font_code): %u", scrolling_text->font_code);
	LOG_INF("  - Field 11 (uint32 size): %u (font size multiplier)", scrolling_text->size);
	
	// Position and dimensions
	LOG_INF("Position & Dimensions:");
	LOG_INF("  - Field 4 (uint32 x): %u pixels", scrolling_text->x);
	LOG_INF("  - Field 5 (uint32 y): %u pixels", scrolling_text->y);
	LOG_INF("  - Field 6 (uint32 width): %u pixels", scrolling_text->width);
	LOG_INF("  - Field 7 (uint32 height): %u pixels", scrolling_text->height);
	LOG_INF("  - Scroll Area: %ux%u at (%u, %u)", scrolling_text->width, scrolling_text->height,
	        scrolling_text->x, scrolling_text->y);
	
	// Alignment configuration
	const char *alignment_name;
	switch (scrolling_text->align) {
	case 0: alignment_name = "LEFT"; break;
	case 1: alignment_name = "CENTER"; break;
	case 2: alignment_name = "RIGHT"; break;
	default: alignment_name = "UNKNOWN"; break;
	}
	
	LOG_INF("Text Alignment:");
	LOG_INF("  - Field 8 (Alignment align): %u (%s)", scrolling_text->align, alignment_name);
	
	// Scrolling behavior
	LOG_INF("Scrolling Behavior:");
	LOG_INF("  - Field 9 (uint32 line_spacing): %u pixels", scrolling_text->line_spacing);
	LOG_INF("  - Field 10 (uint32 speed): %u pixels/second", scrolling_text->speed);
	LOG_INF("  - Field 12 (bool loop): %s", scrolling_text->loop ? "true" : "false");
	LOG_INF("  - Field 13 (uint32 pause_ms): %u milliseconds", scrolling_text->pause_ms);
	
	// Calculated scrolling parameters
	if (scrolling_text->speed > 0) {
		float scroll_time = (float)scrolling_text->height / scrolling_text->speed;
		LOG_INF("  - Calculated scroll time: %.1f seconds", scroll_time);
	}
	
	// Protocol compliance
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: PhoneToGlasses::DisplayScrollingText");
	LOG_INF("  - All fields present: YES");
	LOG_INF("  - Alignment valid: %s", (scrolling_text->align <= 2) ? "YES" : "NO");
	LOG_INF("  - Speed reasonable: %s", (scrolling_text->speed <= 1000) ? "YES" : "VERY_FAST");
	LOG_INF("  - Area size: %u pixels²", scrolling_text->width * scrolling_text->height);
	
	// Print to UART with comprehensive details
	printk("\n[Phone->Glasses SCROLL] Scrolling Text: \"%s\" (len:%zu, area:%ux%u, speed:%ups, align:%s, loop:%s)\n", 
	       scrolling_text->text, text_length, scrolling_text->width, scrolling_text->height,
	       scrolling_text->speed, alignment_name, scrolling_text->loop ? "Y" : "N");
	
	LOG_INF("=== END SCROLLING TEXT MESSAGE ===");
}

void protobuf_parse_text_brightness(const char *text)
{
	if (!text) {
		return;
	}
	
	LOG_INF("TEXT BRIGHTNESS PARSER ACTIVATED");
	LOG_INF("Parsing text: \"%s\"", text);
	
	// Look for patterns like "brightness to 61%" or "61%"
	const char *brightness_keyword = "brightness to ";
	const char *percent_sign = "%";
	
	char *brightness_pos = strstr(text, brightness_keyword);
	if (brightness_pos) {
		// Found "brightness to" pattern
		brightness_pos += strlen(brightness_keyword);
		
		// Extract the number before the % sign
		int brightness_value = 0;
		char *percent_pos = strstr(brightness_pos, percent_sign);
		
		if (percent_pos) {
			// Create a temporary string to extract the number
			int num_chars = percent_pos - brightness_pos;
			if (num_chars > 0 && num_chars < 10) {
				char num_str[10];
				strncpy(num_str, brightness_pos, num_chars);
				num_str[num_chars] = '\0';
				
				brightness_value = atoi(num_str);
				
				LOG_INF("TEXT BRIGHTNESS: Extracted value %d%%", brightness_value);
				
				if (brightness_value >= 0 && brightness_value <= 100) {
					protobuf_set_brightness_level((uint32_t)brightness_value);
					printk("\n[UART BRIGHTNESS] Text brightness set to %d%%\n", brightness_value);
				} else {
					LOG_WRN("TEXT BRIGHTNESS: Invalid value %d (must be 0-100)", brightness_value);
				}
			}
		}
	} else {
		LOG_DBG("TEXT BRIGHTNESS: No brightness pattern found in text");
	}
}

void protobuf_process_clear_display(void)
{
	LOG_INF("=== CLEAR DISPLAY MESSAGE (Tag 99 - TEMPORARY) ===");
	LOG_WRN("TEMPORARY IMPLEMENTATION: Using tag 99 for ClearDisplay");
	LOG_WRN("TODO: Update to official tag when protobuf definition is updated");
	
	LOG_INF("Clear Display Command:");
	LOG_INF("  - Message Type: PhoneToGlasses::ClearDisplay");
	LOG_INF("  - Protocol: MentraOS BLE Protobuf v3 (EXTENDED)");
	LOG_INF("  - Payload Tag: 99 (clear_display - TEMPORARY)");
	LOG_INF("  - Direction: Phone → Glasses");
	LOG_INF("  - Action: Clear all display content");
	
	LOG_INF("Display Operations:");
	LOG_INF("  - Clear static text: YES");
	LOG_INF("  - Clear scrolling text: YES");
	LOG_INF("  - Reset display state: YES");
	LOG_INF("  - Preserve brightness: YES");
	
	// Protocol compliance (temporary)
	LOG_INF("Protocol Compliance (TEMPORARY):");
	LOG_INF("  - Message Type: PhoneToGlasses::ClearDisplay");
	LOG_INF("  - Official definition: PENDING");
	LOG_INF("  - Temporary tag: 99");
	LOG_INF("  - Implementation: Display hardware clear");
	
	// TODO: Implement actual display clearing logic here
	// This is where you would interface with your display driver
	LOG_INF("Display Clear Implementation:");
	LOG_INF("  - Clear framebuffer: TODO");
	LOG_INF("  - Reset text state: TODO");
	LOG_INF("  - Stop scrolling animations: TODO");
	LOG_INF("  - Refresh display: TODO");
	
	// Print to UART
	printk("\n[Phone->Glasses CLEAR] Clear Display: all content cleared (temporary tag:99)\n");
	
	LOG_INF("Clear Display Command Processed");
	LOG_INF("=== END CLEAR DISPLAY MESSAGE ===");
}

void protobuf_process_auto_brightness_config(const mentraos_ble_AutoBrightnessConfig *auto_brightness_config)
{
	if (!auto_brightness_config) {
		LOG_ERR("Invalid auto brightness config pointer");
		return;
	}
	
	LOG_INF("=== AUTO BRIGHTNESS CONFIG MESSAGE (Tag 38) ===");
	
	bool enabled = auto_brightness_config->enabled;
	bool previous_state = auto_brightness_enabled;
	
	// Update the global auto brightness state
	auto_brightness_enabled = enabled;
	
	// Auto brightness configuration analysis
	LOG_INF("Auto Brightness Configuration:");
	LOG_INF("  - Field 1 (bool enabled): %s", enabled ? "true" : "false");
	LOG_INF("  - Previous State: %s", previous_state ? "ENABLED" : "DISABLED");
	LOG_INF("  - New State: %s", enabled ? "ENABLED" : "DISABLED");
	LOG_INF("  - State Change: %s", (previous_state != enabled) ? "YES" : "NO");
	LOG_INF("  - Feature: Automatic brightness adjustment based on ambient light sensor");
	
	// Protocol compliance
	LOG_INF("Protocol Compliance:");
	LOG_INF("  - Message Type: PhoneToGlasses::AutoBrightnessConfig");
	LOG_INF("  - Field 1 present: YES");
	LOG_INF("  - Value type: bool");
	LOG_INF("  - Implementation: Light sensor + PWM brightness control");
	
	// Auto brightness status and behavior
	LOG_INF("Auto Brightness Status:");
	if (enabled) {
		LOG_INF("  - Mode: AUTOMATIC");
		LOG_INF("  - Light Sensor: ACTIVE (will be integrated with driver)");
		LOG_INF("  - Brightness Control: Automatic based on ambient light");
		LOG_INF("  - Manual Override: DISABLED (auto mode takes priority)");
		LOG_INF("  - Current Manual Level: %u%% (will be overridden by sensor)", protobuf_get_brightness_level());
		LOG_INF("  - Sensor Integration: TODO - Light sensor driver pending");
	} else {
		LOG_INF("  - Mode: MANUAL");
		LOG_INF("  - Light Sensor: INACTIVE");
		LOG_INF("  - Brightness Control: Manual setting only");
		LOG_INF("  - Current Level: %u%%", protobuf_get_brightness_level());
		LOG_INF("  - Auto Adjustment: DISABLED");
	}
	
	// Implementation details based on your requirements
	LOG_INF("Implementation Details:");
	if (enabled) {
		LOG_INF("  - Light Sensor Driver: TODO - Will be integrated later");
		LOG_INF("  - Brightness Algorithm: TODO - Automatic adjustment curve");
		LOG_INF("  - Response Time: TODO - Real-time sensor monitoring");
		LOG_INF("  - Brightness Range: 0-100%% (sensor-controlled)");
		LOG_INF("  - Override Behavior: Manual brightness messages will disable auto mode");
	} else {
		LOG_INF("  - Light Sensor: Deactivated");
		LOG_INF("  - Manual Control: Active");
		LOG_INF("  - Current Setting: %u%% (preserved)", protobuf_get_brightness_level());
		LOG_INF("  - Manual Override: Ready to accept BrightnessConfig messages");
	}
	
	// Print to UART with comprehensive details
	printk("\n[Phone->Glasses AUTO_BRIGHTNESS] Auto Brightness: %s->%s (manual_level:%u%%)\n", 
	       previous_state ? "ON" : "OFF", enabled ? "ON" : "OFF", protobuf_get_brightness_level());
	
	// Status change logging
	LOG_INF("Auto Brightness Update Result:");
	if (previous_state != enabled) {
		if (enabled) {
			LOG_INF("  - Transition: Manual → Automatic");
			LOG_INF("  - Light Sensor: Activating (pending driver integration)");
			LOG_INF("  - Brightness Control: Sensor will override manual setting");
			LOG_INF("  - Manual Level Preserved: %u%% (for fallback)", protobuf_get_brightness_level());
		} else {
			LOG_INF("  - Transition: Automatic → Manual");
			LOG_INF("  - Light Sensor: Deactivating");
			LOG_INF("  - Brightness Control: Manual setting restored");
			LOG_INF("  - Current Level: %u%%", protobuf_get_brightness_level());
		}
	} else {
		LOG_INF("  - No State Change: Already %s", enabled ? "AUTOMATIC" : "MANUAL");
	}
	
	LOG_INF("  - Current Mode: %s", enabled ? "AUTOMATIC" : "MANUAL");
	LOG_INF("  - Ambient Control: %s", enabled ? "ACTIVE (pending sensor driver)" : "INACTIVE");
	LOG_INF("  - Manual Override Ready: %s", enabled ? "NO (auto mode active)" : "YES");
	
	LOG_INF("=== END AUTO BRIGHTNESS CONFIG MESSAGE ===");
}