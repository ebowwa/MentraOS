#ifndef PROTOCOL_BLE_PROCESS_H
#define PROTOCOL_BLE_PROCESS_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Protocol BLE Process module declarations
 */

/* BLE message types */
typedef enum {
    PROTOCOL_BLE_MSG_TYPE_UNKNOWN = 0,
    PROTOCOL_BLE_MSG_TYPE_COMMAND,
    PROTOCOL_BLE_MSG_TYPE_DATA,
    PROTOCOL_BLE_MSG_TYPE_IMAGE,
    PROTOCOL_BLE_MSG_TYPE_AUDIO,
    PROTOCOL_BLE_MSG_TYPE_PROTOBUF,
    PROTOCOL_BLE_MSG_TYPE_STATUS,
    PROTOCOL_BLE_MSG_TYPE_MAX
} protocol_ble_msg_type_t;

/* BLE process status */
typedef enum {
    PROTOCOL_BLE_PROCESS_STATUS_IDLE = 0,
    PROTOCOL_BLE_PROCESS_STATUS_PROCESSING,
    PROTOCOL_BLE_PROCESS_STATUS_SUCCESS,
    PROTOCOL_BLE_PROCESS_STATUS_ERROR
} protocol_ble_process_status_t;

/* BLE message structure */
typedef struct {
    protocol_ble_msg_type_t type;
    uint16_t length;
    uint8_t *data;
    uint32_t timestamp;
} protocol_ble_message_t;

/* BLE process callback function type */
typedef void (*protocol_ble_process_callback_t)(const protocol_ble_message_t *message, protocol_ble_process_status_t status);

/**
 * @brief Initialize the BLE process module
 * @param callback Process completion callback
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_init(protocol_ble_process_callback_t callback);

/**
 * @brief Process received BLE data
 * @param data Raw BLE data
 * @param length Data length
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_data(const uint8_t *data, uint16_t length);

/**
 * @brief Process protobuf message
 * @param pb_data Protobuf encoded data
 * @param pb_length Protobuf data length
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_protobuf(const uint8_t *pb_data, uint16_t pb_length);

/**
 * @brief Process command message
 * @param cmd_id Command identifier
 * @param params Command parameters
 * @param param_count Number of parameters
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_command(uint8_t cmd_id, const uint8_t *params, uint16_t param_count);

/**
 * @brief Process image data
 * @param image_id Image identifier
 * @param image_data Image data
 * @param image_size Image data size
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_image(uint16_t image_id, const uint8_t *image_data, uint32_t image_size);

/**
 * @brief Process audio data
 * @param audio_format Audio format
 * @param audio_data Audio data
 * @param audio_size Audio data size
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_audio(uint8_t audio_format, const uint8_t *audio_data, uint32_t audio_size);

/**
 * @brief Get process status
 * @return Current process status
 */
protocol_ble_process_status_t protocol_ble_process_get_status(void);

/**
 * @brief Set message callback
 * @param callback Message processing callback
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_set_callback(protocol_ble_process_callback_t callback);

/**
 * @brief Parse BLE message header
 * @param data Input data buffer
 * @param length Input data length
 * @param msg_type Output message type
 * @param payload_length Output payload length
 * @return 0 on success, negative error code on failure
 */
int protocol_ble_process_parse_header(const uint8_t *data, uint16_t length, protocol_ble_msg_type_t *msg_type, uint16_t *payload_length);

/**
 * @brief Enqueue completed image stream
 * @param stream Completed image stream
 * @return true if enqueued successfully, false otherwise
 */
bool enqueue_completed_stream(image_stream *stream);

#ifdef __cplusplus
}
#endif

#endif /* PROTOCOL_BLE_PROCESS_H */

/**
 * @brief Validate message integrity
 * @param message Message to validate
 * @return true if message is valid, false otherwise
 */
bool protocol_ble_process_validate_message(const protocol_ble_message_t *message);

/**
 * @brief Get process statistics
 * @param messages_processed Total messages processed
 * @param bytes_processed Total bytes processed
 * @param errors Total processing errors
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_get_stats(uint32_t *messages_processed, uint32_t *bytes_processed, uint32_t *errors);

/**
 * @brief Reset process statistics
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_reset_stats(void);

/**
 * @brief Deinitialize the BLE process module
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int protocol_ble_process_deinit(void);

#ifdef __cplusplus
}
#endif

#endif /* PROTOCOL_BLE_PROCESS_H */
