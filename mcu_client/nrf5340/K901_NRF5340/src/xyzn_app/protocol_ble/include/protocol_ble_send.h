#ifndef PROTOCOL_BLE_SEND_H
#define PROTOCOL_BLE_SEND_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Protocol BLE Send module declarations
 */

/* BLE send status */
typedef enum {
    PROTOCOL_BLE_SEND_STATUS_IDLE = 0,
    PROTOCOL_BLE_SEND_STATUS_SENDING,
    PROTOCOL_BLE_SEND_STATUS_SUCCESS,
    PROTOCOL_BLE_SEND_STATUS_ERROR
} protocol_ble_send_status_t;

/* BLE send configuration */
typedef struct {
    uint16_t max_packet_size;
    uint16_t retry_count;
    uint32_t timeout_ms;
} protocol_ble_send_config_t;

/* BLE send callback function type */
typedef void (*protocol_ble_send_callback_t)(protocol_ble_send_status_t status, uint32_t bytes_sent);

/**
 * @brief Initialize the BLE send protocol
 * @param config Send configuration
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_init(const protocol_ble_send_config_t *config);

/**
 * @brief Send data via BLE
 * @param data Data buffer to send
 * @param length Data length
 * @param callback Completion callback (optional)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_data(const uint8_t *data, uint32_t length, protocol_ble_send_callback_t callback);

/**
 * @brief Send data with fragmentation
 * @param data Data buffer to send
 * @param length Data length
 * @param fragment_size Fragment size for large data
 * @param callback Completion callback (optional)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_data_fragmented(const uint8_t *data, uint32_t length, uint16_t fragment_size, protocol_ble_send_callback_t callback);

/**
 * @brief Send protobuf message
 * @param msg_type Message type identifier
 * @param pb_data Protobuf encoded data
 * @param pb_length Protobuf data length
 * @param callback Completion callback (optional)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_protobuf(uint8_t msg_type, const uint8_t *pb_data, uint32_t pb_length, protocol_ble_send_callback_t callback);

/**
 * @brief Send image data
 * @param image_id Image identifier
 * @param image_data Image data buffer
 * @param image_size Image data size
 * @param callback Completion callback (optional)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_image(uint16_t image_id, const uint8_t *image_data, uint32_t image_size, protocol_ble_send_callback_t callback);

/**
 * @brief Send audio data
 * @param audio_format Audio format identifier
 * @param audio_data Audio data buffer
 * @param audio_size Audio data size
 * @param callback Completion callback (optional)
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_audio(uint8_t audio_format, const uint8_t *audio_data, uint32_t audio_size, protocol_ble_send_callback_t callback);

/**
 * @brief Get current send status
 * @return Current send status
 */
protocol_ble_send_status_t protocol_ble_send_get_status(void);

/**
 * @brief Cancel ongoing send operation
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_cancel(void);

/**
 * @brief Get send statistics
 * @param bytes_sent Total bytes sent
 * @param packets_sent Total packets sent
 * @param errors Total errors
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_get_stats(uint32_t *bytes_sent, uint32_t *packets_sent, uint32_t *errors);

/**
 * @brief Reset send statistics
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_reset_stats(void);

/**
 * @brief Deinitialize the BLE send protocol
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_send_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* PROTOCOL_BLE_SEND_H */
