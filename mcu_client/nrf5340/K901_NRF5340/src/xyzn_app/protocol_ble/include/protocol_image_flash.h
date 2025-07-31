#ifndef PROTOCOL_IMAGE_FLASH_H
#define PROTOCOL_IMAGE_FLASH_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Protocol image flash handling declarations
 */

/* Image metadata structure */
typedef struct {
    uint32_t image_id;
    uint32_t image_size;
    uint32_t checksum;
    uint32_t format;
} preload_image_metadata_t;

/* Flash storage configuration */
typedef struct {
    uint32_t sector_size;
    uint32_t total_size;
    uint32_t page_size;
} protocol_image_flash_config_t;

/* Flash handle type */
typedef void* protocol_image_flash_handle_t;

/**
 * @brief Initialize image flash storage
 * @param config Flash configuration
 * @return Handle to flash instance or NULL on error
 */
protocol_image_flash_handle_t protocol_image_flash_init(const protocol_image_flash_config_t *config);

/**
 * @brief Write image data to flash
 * @param handle Flash handle
 * @param offset Offset in flash
 * @param data Data to write
 * @param len Length of data
 * @return Number of bytes written, negative on error
 */
int protocol_image_flash_write(protocol_image_flash_handle_t handle, uint32_t offset, const uint8_t *data, uint32_t len);

/**
 * @brief Read image data from flash
 * @param handle Flash handle
 * @param offset Offset in flash
 * @param data Buffer to read into
 * @param len Length to read
 * @return Number of bytes read, negative on error
 */
int protocol_image_flash_read(protocol_image_flash_handle_t handle, uint32_t offset, uint8_t *data, uint32_t len);

/**
 * @brief Erase flash sector
 * @param handle Flash handle
 * @param sector_addr Sector address
 * @return 0 on success, negative on error
 */
int protocol_image_flash_erase_sector(protocol_image_flash_handle_t handle, uint32_t sector_addr);

/**
 * @brief Deinitialize image flash storage
 * @param handle Flash handle
 * @return 0 on success, negative on error
 */
int protocol_image_flash_deinit(protocol_image_flash_handle_t handle);

#ifdef __cplusplus
}
#endif

#endif /* PROTOCOL_IMAGE_FLASH_H */
