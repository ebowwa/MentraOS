#ifndef XYZN_BLE_H
#define XYZN_BLE_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BLE packet opcodes
 */
#define BLE_OPCODE_PING          0x01
#define BLE_OPCODE_AUDIO_DATA    0x02
#define BLE_OPCODE_IMAGE_BLOCK   0x03
#define BLE_OPCODE_STATUS        0x04

/**
 * @brief Maximum payload size for BLE packets
 */
#define BLE_MAX_PAYLOAD_SIZE     512

/**
 * @brief BLE image block structure for image transfer
 */
typedef struct {
    uint32_t block_id;           // Block identifier
    uint32_t total_blocks;       // Total number of blocks
    uint16_t block_size;         // Size of this block
    uint8_t data[BLE_MAX_PAYLOAD_SIZE]; // Block data
} ble_image_block;

/**
 * @brief BLE ping packet structure
 */
typedef struct {
    uint32_t sequence;
    uint32_t timestamp;
} ble_ping_packet;

/**
 * @brief BLE audio data packet structure
 */
typedef struct {
    uint16_t sample_rate;
    uint16_t channels;
    uint16_t data_size;
    uint8_t audio_data[BLE_MAX_PAYLOAD_SIZE - 6]; // Remaining space for audio
} ble_audio_packet;

/**
 * @brief Main BLE packet structure with union payload
 */
typedef struct {
    uint8_t opcode;              // Operation code
    uint16_t payload_size;       // Size of payload
    union {
        ble_ping_packet ping;
        ble_audio_packet audio;
        ble_image_block image;
        uint8_t raw_data[BLE_MAX_PAYLOAD_SIZE];
    } payload;
} ble_packet;

/**
 * @brief BLE service configuration structure
 */
typedef struct {
    uint16_t service_uuid;
    uint16_t char_uuid;
    uint32_t max_packet_size;
} xyzn_ble_service_config_t;

/**
 * @brief BLE service handle type
 */
typedef void* xyzn_ble_service_handle_t;

/**
 * @brief Initialize BLE service
 * @param config Service configuration
 * @return Handle to service instance or NULL on error
 */
xyzn_ble_service_handle_t xyzn_ble_service_init(const xyzn_ble_service_config_t *config);

/**
 * @brief Send BLE packet
 * @param handle Service handle
 * @param packet Packet to send
 * @return 0 on success, negative on error
 */
int xyzn_ble_send_packet(xyzn_ble_service_handle_t handle, const ble_packet *packet);

/**
 * @brief Receive BLE packet
 * @param handle Service handle
 * @param packet Buffer for received packet
 * @param timeout_ms Timeout in milliseconds
 * @return 0 on success, negative on error
 */
int xyzn_ble_receive_packet(xyzn_ble_service_handle_t handle, ble_packet *packet, uint32_t timeout_ms);

/**
 * @brief Check if BLE service is connected
 * @param handle Service handle
 * @return true if connected, false otherwise
 */
bool xyzn_ble_is_connected(xyzn_ble_service_handle_t handle);

/**
 * @brief Deinitialize BLE service
 * @param handle Service handle
 */
void xyzn_ble_service_deinit(xyzn_ble_service_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif // XYZN_BLE_H