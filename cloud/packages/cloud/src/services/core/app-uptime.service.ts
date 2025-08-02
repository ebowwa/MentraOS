import { timeStamp } from "console";
import { AppUptime } from "../../models/app-uptime.model";
import { logger as rootLogger } from "../logging/pino-logger";
const logger = rootLogger.child({ service: 'app-uptime.service' });

export async function recordAppUptime(packageName: string): Promise<void> {
    // One way to make a new app uptime entry in db.
//   const uptimeRecord = new AppUptime({
//     packageName,
//     timestamp: new Date(),
//   });
//   return uptimeRecord.save();


    // Get all app uptimes for merge.
    // const appUptimes = await AppUptime.find({
    //     packageName: "com.mentra.merge",

    // })

    // Another way to create an app uptime.
    const appUptime = await AppUptime.create({
        packageName: "com.mentra.merge",
        timestamp: Date.now()
    });

    appUptime.packageName = packageName + "rfwf";
    await appUptime.save();

    // another way to update.
    const updatedAppUptime = await AppUptime.findByIdAndUpdate(
        appUptime._id,
        { timestamp: new Date() },
        { new: true } // Return the updated document
    );
}

// start app uptime check.
export async function startAppUptimeCheck() {
    logger.info("Starting app uptime check...");
}

// some interval to trigger the uptime check..