/*
 * Shell Battery Control Module
 * 
 * Battery monitoring and fuel gauge control commands
 * 
 * Available Commands:
 * - battery help              : Show all battery commands
 * - battery status             : Show current battery status
 * - battery monitor start      : Start continuous battery monitoring
 * - battery monitor stop       : Stop battery monitoring
 * - battery monitor status     : Show monitoring status
 * 
 * Created: 2025-10-28
 * Author: MentraOS Team
 */

#include <zephyr/kernel.h>
#include <zephyr/shell/shell.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <stdbool.h>
#include <errno.h>

#include "mos_fuel_gauge.h"

LOG_MODULE_REGISTER(shell_battery, LOG_LEVEL_INF);

/* nPM1300 charge status bitmasks (matching mos_fuel_gauge.c) / nPM1300充电状态位掩码（与mos_fuel_gauge.c一致） */
#define CHG_STATUS_COMPLETE_MASK (1 << 1)  /* 0x02 / 充电完成 */
#define CHG_STATUS_TRICKLE_MASK  (1 << 2)  /* 0x04 / 涓流充电 */
#define CHG_STATUS_CC_MASK       (1 << 3)  /* 0x08 / 恒流充电 */
#define CHG_STATUS_CV_MASK       (1 << 4)  /* 0x10 / 恒压充电 */

/* Monitoring control variables / 监控控制变量 */
static bool monitoring_active = false;
static struct k_work_delayable monitor_work;

#define MONITOR_INTERVAL_MS 5000  /* 5 seconds / 5秒 */

/**
 * @brief Battery monitoring work handler (called periodically by work queue)
 * 电池监控工作队列处理函数（由工作队列周期性调用）
 */
static void battery_monitor_work_handler(struct k_work *work)
{
	if (!monitoring_active)
	{
		return;
	}

	/* Update battery status / 更新电池状态 */
	LOG_INF("Battery monitor update... / 电池监控更新中...");
	battery_monitor();

	/* Schedule next update / 安排下次更新 */
	k_work_schedule((struct k_work_delayable *)work, K_MSEC(MONITOR_INTERVAL_MS));
}

static int cmd_battery_help(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	shell_print(shell, "");
	shell_print(shell, "🔋 Battery Control Commands:");
	shell_print(shell, "");
	shell_print(shell, "📋 Basic Commands:");
	shell_print(shell, "  battery help                     - Show this help menu");
	shell_print(shell, "  battery status                   - Show current battery status");
	shell_print(shell, "  battery charge-mode              - Show current charging mode");
	shell_print(shell, "");
	shell_print(shell, "🧪 Monitor Commands:");
	shell_print(shell, "  battery monitor start            - Start continuous monitoring");
	shell_print(shell, "  battery monitor stop             - Stop monitoring");
	shell_print(shell, "  battery monitor status           - Show monitoring status");
	shell_print(shell, "");
	shell_print(shell, "📊 Status shows: Voltage, Current, Temperature, SoC%%, TTE, TTF");
	shell_print(shell, "");

	return 0;
}

static int cmd_battery_status(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	shell_print(shell, "");
	shell_print(shell, "🔋 Current Battery Status / 当前电池状态:");
	
	/* Trigger one-time battery status update / 触发一次性电池状态更新 */
	battery_monitor();
	
	shell_print(shell, "✅ Status updated, check logs above / 状态已更新，请查看上方日志");
	shell_print(shell, "");

	return 0;
}

static int cmd_battery_charge_mode(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	int32_t chg_status;
	int ret;
	const char *mode_name_en = "Unknown";
	const char *mode_name_cn = "未知";

	shell_print(shell, "");
	shell_print(shell, "🔌 Charging Mode / 充电模式:");

	ret = battery_get_charge_status(&chg_status);
	if (ret < 0)
	{
		shell_print(shell, "❌ Failed to read charge status: %d / 读取充电状态失败: %d", ret, ret);
		shell_print(shell, "");
		return ret;
	}

	/* Parse charge status and show mode / 解析充电状态并显示模式 */
	if (chg_status & CHG_STATUS_COMPLETE_MASK)
	{
		mode_name_en = "Complete";
		mode_name_cn = "完成";
	}
	else if (chg_status & CHG_STATUS_TRICKLE_MASK)
	{
		mode_name_en = "Trickle";
		mode_name_cn = "涓流充电";
	}
	else if (chg_status & CHG_STATUS_CC_MASK)
	{
		mode_name_en = "Constant Current (CC)";
		mode_name_cn = "恒流充电";
	}
	else if (chg_status & CHG_STATUS_CV_MASK)
	{
		mode_name_en = "Constant Voltage (CV)";
		mode_name_cn = "恒压充电";
	}
	else
	{
		mode_name_en = "Idle";
		mode_name_cn = "空闲";
	}

	shell_print(shell, "  Status register: 0x%02X / 状态寄存器: 0x%02X", chg_status, chg_status);
	shell_print(shell, "  Mode: %s / %s", mode_name_en, mode_name_cn);
	shell_print(shell, "");

	return 0;
}

static int cmd_battery_monitor_start(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	if (monitoring_active)
	{
		shell_print(shell, "⚠️  Battery monitoring already running / 电池监控已在运行");
		return 0;
	}

	/* Initialize work queue if first time / 首次使用时初始化工作队列 */
	static bool work_initialized = false;
	if (!work_initialized)
	{
		k_work_init_delayable(&monitor_work, battery_monitor_work_handler);
		work_initialized = true;
	}

	monitoring_active = true;

	/* Schedule first monitoring update / 安排首次监控更新 */
	/* Note: k_work_schedule returns 1 if work is already scheduled, which is OK / 注意：如果工作已调度，返回1是正常的 */
	int ret = k_work_schedule(&monitor_work, K_NO_WAIT);
	if (ret < 0)
	{
		LOG_ERR("Failed to schedule work: %d / 工作调度失败: %d", ret);
		monitoring_active = false;
		shell_print(shell, "❌ Failed to start monitoring / 监控启动失败");
		return -EIO;
	}

	shell_print(shell, "✅ Battery monitoring started (interval: %d ms) / 电池监控已启动(间隔: %d毫秒)",
		    MONITOR_INTERVAL_MS, MONITOR_INTERVAL_MS);
	shell_print(shell, "");

	return 0;
}

static int cmd_battery_monitor_stop(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	if (!monitoring_active)
	{
		shell_print(shell, "⚠️  Battery monitoring not running / 电池监控未运行");
		return 0;
	}

	monitoring_active = false;

	/* Cancel scheduled work / 取消已安排的工作 */
	k_work_cancel_delayable(&monitor_work);

	shell_print(shell, "✅ Battery monitoring stopped / 电池监控已停止");
	shell_print(shell, "");

	return 0;
}

static int cmd_battery_monitor_status(const struct shell *shell, size_t argc, char **argv)
{
	ARG_UNUSED(argc);
	ARG_UNUSED(argv);

	shell_print(shell, "");
	shell_print(shell, "📊 Battery Monitor Status / 电池监控状态:");
	shell_print(shell, "  Active: %s / %s",
		    monitoring_active ? "Yes" : "No",
		    monitoring_active ? "是" : "否");
	shell_print(shell, "  Interval: %d ms / %d毫秒", MONITOR_INTERVAL_MS, MONITOR_INTERVAL_MS);
	shell_print(shell, "  Method: Work Queue / 工作队列");
	shell_print(shell, "");

	return 0;
}

/* Shell command definitions / Shell命令定义 */
SHELL_STATIC_SUBCMD_SET_CREATE(
	sub_battery_monitor,
	SHELL_CMD(start, NULL, "Start battery monitoring / 启动电池监控",
		  cmd_battery_monitor_start),
	SHELL_CMD(stop, NULL, "Stop battery monitoring / 停止电池监控",
		  cmd_battery_monitor_stop),
	SHELL_CMD(status, NULL, "Show monitoring status / 显示监控状态",
		  cmd_battery_monitor_status),
	SHELL_SUBCMD_SET_END
);

SHELL_STATIC_SUBCMD_SET_CREATE(
	sub_battery,
	SHELL_CMD(help, NULL, "Show battery help / 显示电池帮助", cmd_battery_help),
	SHELL_CMD(status, NULL, "Show battery status / 显示电池状态", cmd_battery_status),
	SHELL_CMD(charge-mode, NULL, "Show charging mode / 显示充电模式", cmd_battery_charge_mode),
	SHELL_CMD(monitor, &sub_battery_monitor, "Battery monitoring control / 电池监控控制",
		  cmd_battery_help),
	SHELL_SUBCMD_SET_END
);

SHELL_CMD_REGISTER(battery, &sub_battery, "Battery control commands / 电池控制命令",
		   cmd_battery_help);

