// Service Layer for App Uptime Business Logic
// This file contains functions that interact with MongoDB to manage app uptime data
// Services contain the "business logic" - the actual work your app does

import { timeStamp } from "console";
import { AppUptime } from "../../models/app-uptime.model";
import { logger as rootLogger } from "../logging/pino-logger";
import axios from "axios";
import App from '../../models/app.model';



interface AppUptimeI {
    packageName: string; 
    timestamp: Date;
    description: string;
    severity: string; 
    appHealthStatus: string;
} 

// Create a specialized logger for this service to help with debugging
const logger = rootLogger.child({ service: 'app-uptime.service' });

/**
 * Records when an app is running by creating/updating uptime records in MongoDB
 * This function demonstrates several ways to work with MongoDB documents
 * 
 * @param packageName - The identifier for the app (like "com.mentra.merge")
 */
export async function recordAppUptime(packageName: string): Promise<void> {
    // METHOD 1: Creating a document using the constructor (commented out)
    // This creates a new AppUptime object in memory, then saves it to database
    //   const uptimeRecord = new AppUptime({
    //     packageName,
    //     timestamp: new Date(),
    //   });
    //   return uptimeRecord.save();

    // METHOD 2: Querying existing documents (commented out)
    // find() searches for documents that match the criteria
    // const appUptimes = await AppUptime.find({
    //     packageName: "com.mentra.merge",
    // })

    // METHOD 3: Creating a document directly in the database
    // create() makes a new document and saves it to MongoDB in one step
    const appUptime = await AppUptime.create({
        packageName: "com.mentra.merge",  // Hardcoded for testing
        timestamp: Date.now()             // Current timestamp
    });

    // Modify the document in memory (adds "rfwf" to the package name)
    // appUptime.packageName = packageName + "rfwf";
    // Save the changes back to MongoDB
    await appUptime.save();

    // METHOD 4: Update a document using findByIdAndUpdate
    // This finds a document by its ID and updates it in one database operation
    // const updatedAppUptime = await AppUptime.findByIdAndUpdate(
    //     appUptime._id,                    // Find document with this ID
    //     { timestamp: new Date() },        // Update timestamp to current time
    //     { new: true }                     // Return the updated document (not the old one)
    // );
}

/**
 * Starts the app uptime monitoring process
 * Currently just logs a message, but could be expanded to start timers, etc.
 */
export async function startAppUptimeCheck() {
    logger.debug("Starting app uptime check...");
}

export async function createAppUptimeData(packageName: string): Promise<void> {
    const appUptime = new AppUptime({
        packageName,
        timestamp: new Date(),
    });
    await appUptime.save();
}

export async function getAppHealth(packageName: string) {
    const healthData = await AppUptime.find({ packageName });
    return healthData;
}




export async function fetchSubmittedAppHealthStatus() {
    console.log('🔍 Fetching submitted apps with health status...');
    const appsData = await App.find({ appStoreStatus: 'SUBMITTED' }).lean();
    console.log(`📊 Found ${appsData.length} submitted apps`);
    
    // Log the structure of the first app to see all available fields
    if (appsData.length > 0) {
        console.log('📋 Sample app object structure:', JSON.stringify(appsData[0], null, 2));
    }
    
    // Check health status for each app by calling their /health endpoint
    const appsWithHealthStatus = [];
    
    for (const app of appsData) {
        let healthStatus = 'offline';
        let healthData = null;
        
        if (app.publicUrl) {
            try {
                console.log(`🏥 Checking health for ${app.packageName} at ${app.publicUrl}/health`);
                const response = await axios.get(`${app.publicUrl}/health`, {
                    timeout: 10000,
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.status === 200 && response.data) {
                    healthData = response.data;
                    console.log(`📋 Health response for ${app.packageName}:`, JSON.stringify(healthData, null, 2));
                    
                    // Check if response matches expected format {"status":"healthy","app":"...","activeSessions":...}
                    if (healthData.status === 'healthy') {
                        healthStatus = 'online';
                        console.log(`✅ ${app.packageName} is healthy - marking as online`);
                    } else {
                        healthStatus = 'offline';
                        console.log(`❌ ${app.packageName} status is ${healthData.status} - marking as offline`);
                    }
                } else {
                    console.log(`⚠️ ${app.packageName} returned status ${response.status} - marking as offline`);
                }
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    if (error.code === 'ECONNABORTED') {
                        console.log(`⏰ ${app.packageName} health check timed out - marking as offline`);
                    } else {
                        console.log(`🔴 ${app.packageName} health check failed: ${error.message} - marking as offline`);
                    }
                } else {
                    console.log(`❌ ${app.packageName} unknown error: ${error} - marking as offline`);
                }
            }
        } else {
            console.log(`⚠️ ${app.packageName} has no publicUrl - marking as offline`);
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
            healthData: healthData
        });
    }
    
    console.log('🎯 Apps with health status:', JSON.stringify(appsWithHealthStatus, null, 2));

    return {
        success: true,
        count: appsData.length,
        apps: appsWithHealthStatus
    };
}





// Store interval reference for cleanup
let uptimeScheduler: NodeJS.Timeout | null = null;

/**
 * Batch function to send uptime data to database
 * Fetches all submitted apps and records their health status
 */
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
            let health: 'healthy' | 'degraded' | 'offline' = 'offline';
            let responseTimeMs: number | null = null;
            let onlineStatus = false;

            // Determine health status based on healthStatus field
            if (app.healthStatus === 'online') {
                health = 'healthy';
                onlineStatus = true;
                
                // Extract response time if available in healthData
                if (app.healthData && typeof app.healthData === 'object') {
                    responseTimeMs = app.healthData.responseTime || null;
                }
            } else {
                health = 'offline';
                onlineStatus = false;
            }

            const uptimeRecord = {
                packageName: app.packageName,
                timestamp,
                health,
                onlineStatus,
                responseTimeMs
            };

            batchData.push(uptimeRecord);
        }

        // Batch insert all uptime records
        if (batchData.length > 0) {
            await AppUptime.insertMany(batchData);
            logger.debug(`Successfully saved ${batchData.length} uptime records to database`);
        } else {
            logger.warn("No uptime data to save");
        }

    } catch (error) {
        logger.error("Error in batch uptime data collection:", error);
        throw error;
    }
}

/**
 * Start the uptime monitoring scheduler
 * Runs the batch function every minute
 */
export function startUptimeScheduler(): void {
    // Clear existing scheduler if running
    if (uptimeScheduler) {
        clearInterval(uptimeScheduler);
    }

    logger.debug("Starting uptime scheduler - will run every minute");

    // Run immediately on start
    sendBatchUptimeData().catch(error => {
        logger.error("Initial batch uptime collection failed:", error);
    });

    // Schedule to run every minute (60000 ms)
    uptimeScheduler = setInterval(async () => {
        try {
            await sendBatchUptimeData();
        } catch (error) {
            logger.error("Scheduled batch uptime collection failed:", error);
        }
    }, 60000);
}

/**
 * Collect all app health status
 */

export async function collectAllAppBatchStatus(month: string, year: number) {
    try {
        logger.debug(`Collecting app batch status for month: ${month}, year: ${year}`);

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
            const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                               'july', 'august', 'september', 'october', 'november', 'december'];
            
            if (monthNames.includes(monthLower)) {
                monthNumber = monthNames.indexOf(monthLower) + 1;
            } else {
                throw new Error(`Invalid month format: ${month}. Use number (1-12) or month name.`);
            }
        }

        // Create date range for the month
        const startDate = new Date(year, monthNumber - 1, 1);
        const endDate = new Date(year, monthNumber, 0, 23, 59, 59, 999);

        const allUptimeData = await AppUptime.find({
            timestamp: {
                $gte: startDate,
                $lte: endDate
            }
        }).lean();

        logger.debug(`Found ${allUptimeData.length} uptime records for month ${monthNumber}/${year}`);
        
        return {
            success: true,
            count: allUptimeData.length,
            month: month,
            monthNumber: monthNumber,
            year: year,
            dateRange: { start: startDate, end: endDate },
            data: allUptimeData
        };
    } catch (error) {
        logger.error("Error collecting all app batch status:", error);
        throw error;
    }
}

/**
 * Stop the uptime monitoring scheduler
 */
export function stopUptimeScheduler(): void {
    if (uptimeScheduler) {
        clearInterval(uptimeScheduler);
        uptimeScheduler = null;
        logger.debug("Uptime scheduler stopped");
    }
}