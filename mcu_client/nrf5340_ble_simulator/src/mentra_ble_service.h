/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#ifndef MENTRA_BLE_SERVICE_H_
#define MENTRA_BLE_SERVICE_H_

#include <zephyr/types.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>

#ifdef __cplusplus
extern "C" {
#endif

/** @brief Mentra BLE Service UUID */
#define BT_UUID_MENTRA_VAL \
	BT_UUID_128_ENCODE(0x00004860, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

/** @brief TX Characteristic UUID (Phone → Glasses) */
#define BT_UUID_MENTRA_TX_VAL \
	BT_UUID_128_ENCODE(0x000071FF, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

/** @brief RX Characteristic UUID (Glasses → Phone) */
#define BT_UUID_MENTRA_RX_VAL \
	BT_UUID_128_ENCODE(0x000070FF, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

#define BT_UUID_MENTRA    BT_UUID_DECLARE_128(BT_UUID_MENTRA_VAL)
#define BT_UUID_MENTRA_TX BT_UUID_DECLARE_128(BT_UUID_MENTRA_TX_VAL)
#define BT_UUID_MENTRA_RX BT_UUID_DECLARE_128(BT_UUID_MENTRA_RX_VAL)

/** @brief Callback type for when data is received. */
typedef void (*mentra_ble_data_received_cb_t)(struct bt_conn *conn,
					      const uint8_t *const data,
					      uint16_t len);

struct mentra_ble_cb {
	/** Data received callback. */
	mentra_ble_data_received_cb_t received;
};

/** @brief Initialize the Mentra BLE service.
 *
 * @param callbacks Pointer to callback structure.
 *
 * @return 0 if successful, otherwise negative error code.
 */
int mentra_ble_init(struct mentra_ble_cb *callbacks);

/** @brief Send data via the RX characteristic.
 *
 * @param conn Connection object.
 * @param data Pointer to data.
 * @param len Length of data.
 *
 * @return 0 if successful, otherwise negative error code.
 */
int mentra_ble_send(struct bt_conn *conn, const uint8_t *data, uint16_t len);

#ifdef __cplusplus
}
#endif

#endif /* MENTRA_BLE_SERVICE_H_ */
