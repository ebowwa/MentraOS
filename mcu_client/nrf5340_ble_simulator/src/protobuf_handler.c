/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <stdio.h>

#include "protobuf_handler.h"
#include "mentraos_ble.pb.h"
#include <pb_decode.h>
#include <pb_encode.h>

LOG_MODULE_REGISTER(protobuf_handler, LOG_LEVEL_DBG);

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
		break;
	}

	// Show raw ASCII if printable
	LOG_INF("[ASCII] Raw string: \"");
	for (int i = 0; i < len; i++) {
		if (data[i] >= 32 && data[i] <= 126) {
			printk("%c", data[i]);
		} else {
			printk(".");
		}
	}
	printk("\"\n");
	LOG_INF("=== END BLE DATA ===");
}

void protobuf_parse_control_message(const uint8_t *protobuf_data, uint16_t len)
{
	LOG_INF("Parsing protobuf control message (%u bytes) using nanopb", len);
	
	if (len == 0) {
		LOG_WRN("Empty protobuf message");
		return;
	}

	// Try to decode as PhoneToGlasses message
	mentraos_ble_PhoneToGlasses phone_msg = mentraos_ble_PhoneToGlasses_init_default;
	
	if (decode_phone_to_glasses_message(protobuf_data, len, &phone_msg)) {
		LOG_INF("✅ Successfully decoded PhoneToGlasses message!");
		
		// Process the decoded message
		if (phone_msg.has_battery_state_request) {
			LOG_INF("📱 Battery state request received");
			// TODO: Generate battery response
		}
		
		if (phone_msg.has_glasses_info_request) {
			LOG_INF("📱 Glasses info request received");
			// TODO: Generate device info response
		}
		
		if (phone_msg.has_disconnect_request) {
			LOG_INF("📱 Disconnect request received");
			// TODO: Handle disconnect
		}
		
		if (phone_msg.has_display_text) {
			LOG_INF("📱 Display text: \"%s\"", phone_msg.display_text.text);
			// TODO: Display text on glasses
		}
		
		if (phone_msg.has_display_scrolling_text) {
			LOG_INF("📱 Display scrolling text: \"%s\"", 
phone_msg.display_scrolling_text.text);
			// TODO: Display scrolling text
		}
		
		if (phone_msg.has_audio_command) {
			LOG_INF("📱 Audio command received");
			// TODO: Handle audio command
		}
		
	} else {
		LOG_ERR("❌ Failed to decode protobuf message - falling back to basic parsing");
		
		// Fallback to basic parsing for debugging
		for (int i = 0; i < len && i < 10; i++) {
			uint8_t field_tag = protobuf_data[i] >> 3;
			uint8_t wire_type = protobuf_data[i] & 0x07;
			
			LOG_DBG("Protobuf field: tag=%u, wire_type=%u", field_tag, wire_type);
		}
	}
}

bool decode_phone_to_glasses_message(const uint8_t *data, uint16_t len, 
                                    mentraos_ble_PhoneToGlasses *msg)
{
	if (!data || !msg || len == 0) {
		return false;
	}

	// Create input stream
	pb_istream_t stream = pb_istream_from_buffer(data, len);
	
	// Decode the message
	bool status = pb_decode(&stream, mentraos_ble_PhoneToGlasses_fields, msg);
	
	if (!status) {
		LOG_ERR("Protobuf decode error: %s", PB_GET_ERROR(&stream));
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
	
	LOG_INF("🎵 Audio chunk: stream_id=0x%02X, data_len=%u", stream_id, audio_data_len);
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
	
	LOG_INF("🖼️  Image chunk: stream_id=0x%04X, chunk_index=%u, data_len=%u", 
stream_id, chunk_index, image_data_len);
}

int protobuf_generate_echo_response(const uint8_t *input_data, uint16_t input_len,
   uint8_t *output_data, uint16_t max_output_len)
{
	// Create a simple response message
	mentraos_ble_GlassesToPhone response = mentraos_ble_GlassesToPhone_init_default;
	
	// Create a device info response as an example
	response.has_device_info = true;
	strncpy(response.device_info.device_name, "NexSim Enhanced", 
sizeof(response.device_info.device_name) - 1);
	strncpy(response.device_info.firmware_version, "v2.0.0-protobuf", 
sizeof(response.device_info.firmware_version) - 1);
	strncpy(response.device_info.hardware_version, "nRF5340", 
sizeof(response.device_info.hardware_version) - 1);
	
	// Encode the response
	size_t bytes_written;
	if (encode_glasses_to_phone_message(&response, output_data + 1, 
					   max_output_len - 1, &bytes_written)) {
		// Add the 0x02 header for protobuf messages
		output_data[0] = 0x02;
		
		LOG_INF("✅ Generated protobuf echo response: %zu + 1 bytes", bytes_written);
		return bytes_written + 1;
	} else {
		LOG_ERR("❌ Failed to generate protobuf response");
		return -ENOMEM;
	}
}
