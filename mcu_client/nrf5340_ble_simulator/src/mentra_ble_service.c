/*
 * Copyright (c) 2024 Mentra
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/hci.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/bluetooth/gatt.h>

#include "mentra_ble_service.h"

LOG_MODULE_REGISTER(mentra_ble, LOG_LEVEL_DBG);

static struct mentra_ble_cb *mentra_callbacks;

static ssize_t write_tx_char(struct bt_conn *conn,
			     const struct bt_gatt_attr *attr,
			     const void *buf,
			     uint16_t len,
			     uint16_t offset,
			     uint8_t flags)
{
	LOG_INF("Received data, handle %d, conn %p, len %u",
		bt_gatt_attr_get_handle(attr), (void *)conn, len);

	if (mentra_callbacks && mentra_callbacks->received) {
		mentra_callbacks->received(conn, buf, len);
	}

	return len;
}

static void rx_ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
	ARG_UNUSED(attr);

	bool notif_enabled = (value == BT_GATT_CCC_NOTIFY);

	LOG_INF("🔔 RX Characteristic notifications %s", 
		notif_enabled ? "✅ ENABLED" : "❌ DISABLED");
	
	if (notif_enabled) {
		LOG_INF("📱➡️👓 Phone can now receive data from glasses!");
	} else {
		LOG_INF("📱❌👓 Phone cannot receive data - notifications disabled!");
	}
}

/* Mentra BLE Service Declaration */
BT_GATT_SERVICE_DEFINE(mentra_ble_svc,
	BT_GATT_PRIMARY_SERVICE(BT_UUID_MENTRA),
	BT_GATT_CHARACTERISTIC(BT_UUID_MENTRA_TX,
			       BT_GATT_CHRC_WRITE | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
			       BT_GATT_PERM_WRITE,
			       NULL, write_tx_char, NULL),
	BT_GATT_CHARACTERISTIC(BT_UUID_MENTRA_RX,
			       BT_GATT_CHRC_NOTIFY,
			       BT_GATT_PERM_NONE,
			       NULL, NULL, NULL),
	BT_GATT_CCC(rx_ccc_cfg_changed,
		    BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

int mentra_ble_init(struct mentra_ble_cb *callbacks)
{
	if (callbacks) {
		mentra_callbacks = callbacks;
	}

	return 0;
}

int mentra_ble_send(struct bt_conn *conn, const uint8_t *data, uint16_t len)
{
	struct bt_gatt_notify_params params = {0};
	const struct bt_gatt_attr *attr = &mentra_ble_svc.attrs[3];

	params.attr = attr;
	params.data = data;
	params.len = len;
	params.func = NULL;

	if (conn) {
		if (bt_gatt_is_subscribed(conn, attr, BT_GATT_CCC_NOTIFY)) {
			LOG_INF("✅ Client subscribed to notifications - sending data (%u bytes)", len);
			return bt_gatt_notify_cb(conn, &params);
		} else {
			LOG_ERR("❌ Client NOT subscribed to notifications - cannot send data!");
			LOG_ERR("This is why protobuf messages fail on first connection!");
			return -EINVAL;
		}
	} else {
		return bt_gatt_notify(NULL, attr, data, len);
	}
}
