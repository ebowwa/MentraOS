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
    logger.info("Starting app uptime check...");
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


// export async function getSubmittedAppHealthStatus(submittedApps: any[], req: Request, res: Response) {
//      console.log('🔍 GET /get-submitted-app-health-status called');
//       try {
//         const appsData = await App.find({ appStoreStatus: 'SUBMITTED' }).lean();
//         console.log(`📊 Found ${appsData.length} submitted apps`);
        
//         // Send WebSocket message to all connected frontend clients
//         try {
//           const sessionService = new SessionService();
//           const allSessions = sessionService.getAllSessions();
          
//           console.log(`🌐 Broadcasting to ${allSessions.length} connected sessions`);
          
//           const message = {
//             type: 'SUBMITTED_APP_HEALTH_STATUS',
//             data: {
//               success: true,
//               count: appsData.length,
//               apps: appsData,
//               timestamp: new Date()
//             }
//           };
          
//           allSessions.forEach(session => {
//             if (session.websocket && session.websocket.readyState === 1) {
//               session.websocket.send(JSON.stringify(message));
//               console.log(`✅ Sent WebSocket message to session ${session.userId}`);
//             }
//           });
//         } catch (wsError) {
//           console.log('⚠️  WebSocket broadcast failed:', wsError);
//         }
        
//         res.json({
//           success: true,
//           count: appsData.length,
//           apps: appsData
//         });
//       } catch (error) {
//         console.log('❌ Error in get-submitted-app-health-status:', error);
//         logger.error('Error fetching submitted app health status:', error);
//         res.status(500).json({
//           error: true,
//           message: error instanceof Error ? error.message : 'Unknown error occurred'
//         });
//       }
    
//     return updatedApps;
//   }

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

// TODO: Add interval-based uptime checking functionality
// This could use setInterval() to periodically check if apps are still running