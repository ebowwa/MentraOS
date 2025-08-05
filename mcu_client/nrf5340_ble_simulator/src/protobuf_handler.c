/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
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
		
		// Process the decoded message based on payload type
		switch (phone_msg.which_payload) {
		case 11: // battery_state_tag
			LOG_INF("Battery state request received");
			LOG_INF("Current battery level: %u%%", current_battery_level);
			// Send battery response
			protobuf_send_battery_notification();
			break;
			
		case 12: // glasses_info_tag  
			LOG_INF("Glasses info request received");
			// TODO: Generate device info response
			break;
			
		case 10: // disconnect_tag
			LOG_INF("Disconnect request received");
			// TODO: Handle disconnect
			break;
			
		case 30: // display_text_tag
			LOG_INF("Display text received");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_display_text_tag) {
				protobuf_process_display_text(&phone_msg.payload.display_text);
			}
			break;
			
		case 35: // display_scrolling_text_tag
			LOG_INF("Display scrolling text received");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_display_scrolling_text_tag) {
				protobuf_process_display_scrolling_text(&phone_msg.payload.display_scrolling_text);
			}
			break;
			
		case 16: // ping_tag
			LOG_INF("Ping request received");
			// TODO: Send pong response
			break;
			
		case 37: // brightness_tag
			LOG_INF("Brightness config received");
			if (phone_msg.which_payload == mentraos_ble_PhoneToGlasses_brightness_tag) {
				protobuf_process_brightness_config(&phone_msg.payload.brightness);
			}
			break;
			
		default:
			LOG_INF("Unknown message type: %u", phone_msg.which_payload);
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
	// Create a battery status notification message
	mentraos_ble_GlassesToPhone notification = mentraos_ble_GlassesToPhone_init_default;
	
	// Set which_payload to battery_status (tag 10)
	notification.which_payload = 10;
	
	// Fill battery status with current level
	notification.payload.battery_status.level = current_battery_level;
	notification.payload.battery_status.charging = false;
	
	// Encode the notification
	uint8_t buffer[64]; // Small buffer for battery notification
	size_t bytes_written;
	
	if (encode_glasses_to_phone_message(&notification, buffer + 1, 
					   sizeof(buffer) - 1, &bytes_written)) {
		// Add the 0x02 header for protobuf messages
		buffer[0] = 0x02;
		
		// Send via BLE (to all connected clients)
		int ret = mentra_ble_send(NULL, buffer, bytes_written + 1);
		if (ret == 0) {
			LOG_INF("Sent battery level notification: %u%%", current_battery_level);
		} else {
			LOG_WRN("Failed to send battery notification (ret: %d)", ret);
		}
	} else {
		LOG_ERR("Failed to encode battery notification");
	}
}

int protobuf_generate_echo_response(const uint8_t *input_data, uint16_t input_len,
   uint8_t *output_data, uint16_t max_output_len)
{
	// Create a simple response message
	mentraos_ble_GlassesToPhone response = mentraos_ble_GlassesToPhone_init_default;
	
	// Set which_payload to battery_status (tag 10) - simpler than device_info
	response.which_payload = 10;
	
	// Create a battery status response using current battery level
	response.payload.battery_status.level = current_battery_level;
	response.payload.battery_status.charging = false;
	
	// Encode the response
	size_t bytes_written;
	if (encode_glasses_to_phone_message(&response, output_data + 1, 
					   max_output_len - 1, &bytes_written)) {
		// Add the 0x02 header for protobuf messages
		output_data[0] = 0x02;
		
		LOG_INF("Generated protobuf echo response: %zu + 1 bytes (Battery: %u%%)", 
			bytes_written, current_battery_level);
		return bytes_written + 1;
	} else {
		LOG_ERR("Failed to generate protobuf response");
		return -ENOMEM;
	}
}

// ============== BRIGHTNESS CONTROL FUNCTIONS ==============

uint32_t protobuf_get_brightness_level(void)
{
	return current_brightness_level;
}

void protobuf_set_brightness_level(uint32_t level)
{
	// Clamp level to 0-100
	if (level > 100) {
		level = 100;
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
	
	uint32_t new_level = brightness_config->value;
	LOG_INF("Received brightness config: %u%%", new_level);
	
	// Clamp and set the new brightness level
	protobuf_set_brightness_level(new_level);
	
	LOG_INF("Brightness updated to %u%%", current_brightness_level);
}

void protobuf_process_display_text(const mentraos_ble_DisplayText *display_text)
{
	if (!display_text) {
		LOG_ERR("Invalid display text pointer");
		return;
	}
	
	LOG_INF("=== DISPLAY TEXT MESSAGE ===");
	LOG_INF("Text: \"%s\" (length: %zu)", display_text->text, strlen(display_text->text));
	LOG_INF("Color: 0x%06X (RGB565: 0x%04X)", display_text->color, (uint16_t)display_text->color);
	LOG_INF("Font code: %u", display_text->font_code);
	LOG_INF("Position: (%u, %u)", display_text->x, display_text->y);
	LOG_INF("Size: %u", display_text->size);
	
	// Print to UART with text content and length
	printk("\n[UART TEXT] Display Text: \"%s\" (length: %zu)\n", 
	       display_text->text, strlen(display_text->text));
	
	LOG_INF("=== END DISPLAY TEXT ===");
}

void protobuf_process_display_scrolling_text(const mentraos_ble_DisplayScrollingText *scrolling_text)
{
	if (!scrolling_text) {
		LOG_ERR("Invalid scrolling text pointer");
		return;
	}
	
	LOG_INF("=== SCROLLING TEXT MESSAGE ===");
	LOG_INF("Text: \"%s\" (length: %zu)", scrolling_text->text, strlen(scrolling_text->text));
	LOG_INF("Color: 0x%06X (RGB565: 0x%04X)", scrolling_text->color, (uint16_t)scrolling_text->color);
	LOG_INF("Font code: %u", scrolling_text->font_code);
	LOG_INF("Position: (%u, %u)", scrolling_text->x, scrolling_text->y);
	LOG_INF("Area: %ux%u", scrolling_text->width, scrolling_text->height);
	LOG_INF("Alignment: %u", scrolling_text->align);
	LOG_INF("Speed: %u px/sec", scrolling_text->speed);
	LOG_INF("Line spacing: %u px", scrolling_text->line_spacing);
	LOG_INF("Loop: %s", scrolling_text->loop ? "true" : "false");
	LOG_INF("Pause: %u ms", scrolling_text->pause_ms);
	
	// Print to UART with text content and length
	printk("\n[UART TEXT] Scrolling Text: \"%s\" (length: %zu)\n", 
	       scrolling_text->text, strlen(scrolling_text->text));
	
	LOG_INF("=== END SCROLLING TEXT ===");
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