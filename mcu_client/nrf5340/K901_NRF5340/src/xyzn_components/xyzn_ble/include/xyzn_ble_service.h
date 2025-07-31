/***
 * @Author       : XK
 * @Date         : 2025-06-19 13:49:04
 * @LastEditTime : 2025-06-19 15:38:01
 * @FilePath     : xyzn_ble_service.h
 * @Description  :
 * @
 * @Copyright (c) XingYiZhiNeng 2025 , All Rights Reserved.
 */

#ifndef __XYZN_BLE_SERVICE_H__
#define __XYZN_BLE_SERVICE_H__

#include <zephyr/types.h>

#define BT_UUID_MY_SERVICE_VAL \
    BT_UUID_128_ENCODE(0x00004860, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

#define BT_UUID_MY_SERVICE_RX_VAL \
    BT_UUID_128_ENCODE(0x000071FF, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

#define BT_UUID_MY_SERVICE_TX_VAL \
    BT_UUID_128_ENCODE(0x000070FF, 0x0000, 0x1000, 0x8000, 0x00805f9b34fb)

#define BT_UUID_CUSTOM_NUS_SERVICE  BT_UUID_DECLARE_128(BT_UUID_MY_SERVICE_VAL)
#define BT_UUID_CUSTOM_NUS_RX       BT_UUID_DECLARE_128(BT_UUID_MY_SERVICE_RX_VAL)
#define BT_UUID_CUSTOM_NUS_TX       BT_UUID_DECLARE_128(BT_UUID_MY_SERVICE_TX_VAL)

enum custom_nus_send_status
{
    /** Send notification enabled. */
    CUSTOM_SEND_STATUS_ENABLED,
    /** Send notification disabled. */
    CUSTOM_NUS_SEND_STATUS_DISABLED,
};
/* Callback type definitions */
typedef void (*custom_nus_received_cb_t)(struct bt_conn *conn, const uint8_t *data, uint16_t len);
typedef void (*custom_nus_sent_cb_t)(struct bt_conn *conn);
typedef void (*custom_nus_send_enabled_cb_t)(enum custom_nus_send_status enabled);

/* Callback registration structure */
struct custom_nus_cb
{
    custom_nus_received_cb_t received;
    custom_nus_sent_cb_t sent;
    custom_nus_send_enabled_cb_t send_enabled;
};

int custom_nus_init(const struct custom_nus_cb *callbacks);

int custom_nus_send(struct bt_conn *conn, const uint8_t *data, uint16_t len);

#endif // !__XYZN_BLE_SERVICE_H__