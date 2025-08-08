// This file is used to communicate between the MongoDB database

import { AppUptime } from "../../models/app-uptime.model";
import { logger as rootLogger } from "../logging/pino-logger";
import axios from "axios";
import App from "../../models/app.model";

interface AppUptimeI {
  packageName: string;
  timestamp: Date;
  description: string;
  severity: string;
  appHealthStatus: string;
}

const logger = rootLogger.child({ service: "app-uptime.service" }); // Create a specialized logger for this service to help with debugging
const ONE_MINUTE_MS = 60000;
let uptimeScheduler: NodeJS.Timeout | null = null; // Store interval reference for cleanup

//return their current health status.
export async function fetchSubmittedAppHealthStatus() {
  console.log("🔍 Fetching submitted apps with health status...");
  const appsData = await App.find({ appStoreStatus: "SUBMITTED" }).lean();

  // Check health status for each app by calling their /health endpoint
  const appsWithHealthStatus = [];

  for (const app of appsData) {
    let healthStatus = "offline";
    let healthData = null;

    if (app.publicUrl) {
      try {
        console.log(
          `🏥 Checking health for ${app.packageName} at ${app.publicUrl}/health`,
        );
        const response = await axios.get(`${app.publicUrl}/health`, {
          timeout: 10000,
          headers: { "Content-Type": "application/json" },
        });

        if (response.status === 200 && response.data) {
          healthData = response.data;
          console.log(
            `📋 Health response for ${app.packageName}:`,
            JSON.stringify(healthData, null, 2),
          );

          // Check if response matches expected format {"status":"healthy","app":"...","activeSessions":...}
          if (healthData.status === "healthy") {
            healthStatus = "online";
            console.log(`✅ ${app.packageName} is healthy - marking as online`);
          } else {
            healthStatus = "offline";
            console.log(
              `❌ ${app.packageName} status is ${healthData.status} - marking as offline`,
            );
          }
        } else {
          console.log(
            `⚠️ ${app.packageName} returned status ${response.status} - marking as offline`,
          );
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === "ECONNABORTED") {
            console.log(
              `⏰ ${app.packageName} health check timed out - marking as offline`,
            );
          } else {
            console.log(
              `🔴 ${app.packageName} health check failed: ${error.message} - marking as offline`,
            );
          }
        } else {
          console.log(
            `❌ ${app.packageName} unknown error: ${error} - marking as offline`,
          );
        }
      }
    } else {
      console.log(
        `⚠️ ${app.packageName} has no publicUrl - marking as offline`,
      );
    }

    // Add app with health status
    appsWithHealthStatus.push({
      packageName: app.packageName,
      publicUrl: app.publicUrl,
      name: app.name,
      _id: app._id,
      appStoreStatus: app.appStoreStatus,
      updatedAt: app.updatedAt,
      logoURL: app.logoURL,
      description: app.description,
      healthStatus: healthStatus,
      healthData: healthData,
    });
  }

  // console.log('🎯 Apps with health status:', JSON.stringify(appsWithHealthStatus, null, 2));

  return {
    success: true,
    count: appsData.length,
    apps: appsWithHealthStatus,
  };
}

// Collects health data for all submitted apps, transforms it into uptime records, and batch inserts those records into the database.
export async function sendBatchUptimeData(): Promise<void> {
  logger.debug("Starting batch uptime data collection...");

  try {
    // Get all submitted apps with their health status
    const healthResult = await fetchSubmittedAppHealthStatus();

    if (!healthResult.success || !healthResult.apps) {
      logger.warn("No apps found or failed to fetch app health status");
      return;
    }

    const batchData: any[] = [];
    const timestamp = new Date();

    // Process each app and prepare batch data
    for (const app of healthResult.apps) {
      let health: "healthy" | "degraded" | "offline" = "offline";
      let responseTimeMs: number | null = null;
      let onlineStatus = false;

      // Determine health status based on healthStatus field
      if (app.healthStatus === "online") {
        health = "healthy";
        onlineStatus = true;

        // Extract response time if available in healthData
        if (app.healthData && typeof app.healthData === "object") {
          responseTimeMs = app.healthData.responseTime || null;
        }
      } else {
        health = "offline";
        onlineStatus = false;
      }

      const uptimeRecord = {
        packageName: app.packageName,
        timestamp,
        health,
        onlineStatus,
        responseTimeMs,
      };

      batchData.push(uptimeRecord);
    }

    // Batch insert all uptime records
    if (batchData.length > 0) {
      await AppUptime.insertMany(batchData);
      logger.debug(
        `Successfully saved ${batchData.length} uptime records to database`,
      );
    } else {
      logger.warn("No uptime data to save");
    }
  } catch (error) {
    logger.error("Error in batch uptime data collection:", error);
    throw error;
  }
}

// Starts a recurring scheduler that runs sendBatchUptimeData every minute, ensuring only one scheduler is active by clearing any existing one first.
export function startUptimeScheduler(): void {
  // Clear existing scheduler if running
  if (uptimeScheduler) {
    clearInterval(uptimeScheduler);
  }

  logger.debug("Starting uptime scheduler - will run every minute");

  // Run immediately on start
  sendBatchUptimeData().catch((error) => {
    logger.error("Initial batch uptime collection failed:", error);
  });

  // Schedule to run every minute (60000 ms)
  uptimeScheduler = setInterval(async () => {
    try {
      await sendBatchUptimeData();
    } catch (error) {
      logger.error("Scheduled batch uptime collection failed:", error);
    }
  }, ONE_MINUTE_MS);
}

// Fetches all app uptime records for a specified month and year by parsing the input, generating a date range, and querying the database within that range.
export async function collectAllAppBatchStatus(month: string, year: number) {
  try {
    logger.debug(
      `Collecting app batch status for month: ${month}, year: ${year}`,
    );

    let monthNumber: number;

    // Parse month - support numbers (1-12) or month names
    if (!isNaN(Number(month))) {
      // It's a number (1-12)
      monthNumber = parseInt(month);
      if (monthNumber < 1 || monthNumber > 12) {
        throw new Error(`Month number must be between 1-12, got: ${month}`);
      }
    } else {
      // Month name
      const monthLower = month.toLowerCase();
      const monthNames = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];

      if (monthNames.includes(monthLower)) {
        monthNumber = monthNames.indexOf(monthLower) + 1;
      } else {
        throw new Error(
          `Invalid month format: ${month}. Use number (1-12) or month name.`,
        );
      }
    }

    // Create date range for the month
    const startDate = new Date(year, monthNumber - 1, 1);
    const endDate = new Date(year, monthNumber, 0, 23, 59, 59, 999);

    const allUptimeData = await AppUptime.find({
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
    }).lean();

    logger.debug(
      `Found ${allUptimeData.length} uptime records for month ${monthNumber}/${year}`,
    );

    return {
      success: true,
      count: allUptimeData.length,
      month: month,
      monthNumber: monthNumber,
      year: year,
      dateRange: { start: startDate, end: endDate },
      data: allUptimeData,
    };
  } catch (error) {
    logger.error("Error collecting all app batch status:", error);
    throw error;
  }
}

// Stops the uptime scheduler if it is running, clearing the interval and setting the reference to null.
export function stopUptimeScheduler(): void {
  if (uptimeScheduler) {
    clearInterval(uptimeScheduler);
    uptimeScheduler = null;
    logger.debug("Uptime scheduler stopped");
  }
}
