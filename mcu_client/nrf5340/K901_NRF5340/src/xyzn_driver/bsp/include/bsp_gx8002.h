#ifndef BSP_GX8002_H
#define BSP_GX8002_H

#include <stdint.h>
#include <stdbool.h>
#include "bal_os.h"
#include <zephyr/device.h>
#include <zephyr/drivers/gpio.h>

/* GX8002 I2C address */
#define GX8002_I2C_ADDR         0x40

/* GX8002 I2C function declarations */
int gx8002_i2c_write_reg(uint8_t reg, uint8_t value);
int gx8002_i2c_read_reg(uint8_t reg, uint8_t *value);
void gx8002_i2c_start(void);
void gx8002_i2c_stop(void);
int gx8002_write_byte(uint8_t data);
int gx8002_read_byte(uint8_t *data, bool ack);

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief BSP GX8002 component driver declarations
 */

/* GX8002 configuration structure */
typedef struct {
    uint32_t clock_freq;
    uint8_t mode;
    bool enable_interrupt;
} bsp_gx8002_config_t;

/* GX8002 status structure */
typedef struct {
    uint8_t status;
    uint8_t error_code;
    uint32_t data_count;
} bsp_gx8002_status_t;

/* GX8002 handle type */
typedef void* bsp_gx8002_handle_t;

/* GX8002 callback function type */
typedef void (*bsp_gx8002_callback_t)(uint8_t event, const uint8_t *data, uint32_t length);

/**
 * @brief Initialize the GX8002 component
 * @return 0 on success, error code otherwise
 */
int bsp_gx8002_init(void);

/**
 * @brief Start GX8002 operation
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_start(bsp_gx8002_handle_t handle);

/**
 * @brief Stop GX8002 operation
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_stop(bsp_gx8002_handle_t handle);

/**
 * @brief Read data from GX8002
 * @param handle Component handle
 * @param buffer Buffer to store data
 * @param length Buffer length
 * @return Number of bytes read, or negative error code
 */
int bsp_gx8002_read(bsp_gx8002_handle_t handle, uint8_t *buffer, uint32_t length);

/**
 * @brief Write data to GX8002
 * @param handle Component handle
 * @param data Data to write
 * @param length Data length
 * @return Number of bytes written, or negative error code
 */
int bsp_gx8002_write(bsp_gx8002_handle_t handle, const uint8_t *data, uint32_t length);

/**
 * @brief Get GX8002 status
 * @param handle Component handle
 * @param status Pointer to status structure to fill
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_get_status(bsp_gx8002_handle_t handle, bsp_gx8002_status_t *status);

/**
 * @brief Set GX8002 callback function
 * @param handle Component handle
 * @param callback Callback function
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_set_callback(bsp_gx8002_handle_t handle, bsp_gx8002_callback_t callback);

/**
 * @brief Reset GX8002 component
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_reset(bsp_gx8002_handle_t handle);

/**
 * @brief Configure GX8002 parameters
 * @param handle Component handle
 * @param param Parameter identifier
 * @param value Parameter value
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_set_param(bsp_gx8002_handle_t handle, uint8_t param, uint32_t value);

/**
 * @brief Get GX8002 parameter
 * @param handle Component handle
 * @param param Parameter identifier
 * @param value Pointer to store parameter value
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_get_param(bsp_gx8002_handle_t handle, uint8_t param, uint32_t *value);

/**
 * @brief Deinitialize GX8002
 * @param handle Component handle
 * @return XYZN_OS_EOK on success, error code otherwise
 */
int bsp_gx8002_deinit(bsp_gx8002_handle_t handle);

/**
 * @brief Enable GX8002 interrupt ISR
 * @return XYZN_OS_EOK on success, error code otherwise
 */
void gx8002_int_isr_enable(void);

/**
 * @brief Read voice event from GX8002
 * @return Event ID or error code
 */
int gx8002_read_voice_event(void);

#ifdef __cplusplus
}
#endif

#endif /* BSP_GX8002_H */
