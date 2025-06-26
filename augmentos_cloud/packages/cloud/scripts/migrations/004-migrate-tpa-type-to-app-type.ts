/**
 * Migration script: Migrate tpaType to appType
 *
 * This migration:
 * 1. Finds all apps that have a "tpaType" field
 * 2. Copies the value from "tpaType" to "appType" if appType doesn't exist or is empty
 * 3. Keeps the "tpaType" field for backwards compatibility
 * 4. Validates that the tpaType value is valid according to current AppType enum
 *
 * Usage:
 * ts-node -r tsconfig-paths/register scripts/migrations/004-migrate-tpa-type-to-app-type.ts
 *
 * Options:
 * --dry-run         Check what would happen without making changes
 * --package-filter  Only process apps with package name matching pattern (supports regex)
 * --force          Update apps even if they already have appType set
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import App from '../../src/models/app.model';
import { AppType } from '@mentra/sdk';
import { logger as rootLogger } from '../../src/services/logging/pino-logger';

// Configure environment
dotenv.config();

const logger = rootLogger.child({ migration: '004-migrate-tpa-type-to-app-type' });
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_MODE = process.argv.includes('--force');

// Parse command line arguments
const PACKAGE_FILTER_ARG = process.argv.find(arg => arg.startsWith('--package-filter='));
const PACKAGE_FILTER = PACKAGE_FILTER_ARG ? PACKAGE_FILTER_ARG.split('=')[1] : null;

if (DRY_RUN) {
    logger.info('DRY RUN MODE: No changes will be made to the database');
}

if (PACKAGE_FILTER) {
    logger.info(`Package filter mode: Only processing apps with package name matching: ${PACKAGE_FILTER}`);
}

if (FORCE_MODE) {
    logger.info('Force mode: Will update appType even if already set');
}

/**
 * Validates if a tpaType value is valid according to current AppType enum
 * @param tpaType - The tpaType value to validate
 * @returns Whether the value is valid and the normalized value
 */
function validateAndNormalizeTpaType(tpaType: any): { isValid: boolean; normalizedValue?: AppType; error?: string } {
    if (!tpaType) {
        return { isValid: false, error: 'tpaType is null or undefined' };
    }

    const tpaTypeStr = String(tpaType).trim();

    // Check if the value exists in the AppType enum
    const validValues = Object.values(AppType);
    const matchingValue = validValues.find(value =>
        value.toLowerCase() === tpaTypeStr.toLowerCase()
    );

    if (matchingValue) {
        return { isValid: true, normalizedValue: matchingValue };
    }

    // Check for common legacy values that might need mapping
    const legacyMappings: Record<string, AppType> = {
        'third_party': AppType.BACKGROUND,
        'thirdparty': AppType.BACKGROUND,
        'tpa': AppType.BACKGROUND,
        'app': AppType.STANDARD,
        'widget': AppType.SYSTEM_DASHBOARD
    };

    const legacyMatch = legacyMappings[tpaTypeStr.toLowerCase()];
    if (legacyMatch) {
        logger.info(`Mapping legacy tpaType "${tpaTypeStr}" to "${legacyMatch}"`);
        return { isValid: true, normalizedValue: legacyMatch };
    }

    return {
        isValid: false,
        error: `Unknown tpaType value: "${tpaTypeStr}". Valid values: ${validValues.join(', ')}`
    };
}

/**
 * Processes a single app document for migration
 * @param app - The app document to process
 * @returns Migration result
 */
async function migrateApp(app: any): Promise<{
    updated: boolean;
    skipped: boolean;
    error?: string;
    oldValue?: string;
    newValue?: string;
}> {
    try {
        // Check if app has tpaType field
        if (!app.tpaType) {
            return { updated: false, skipped: true, error: 'No tpaType field found' };
        }

        // Check if appType already exists and we're not in force mode
        if (app.appType && !FORCE_MODE) {
            return {
                updated: false,
                skipped: true,
                error: `App already has appType: ${app.appType} (use --force to override)`
            };
        }

        // Validate and normalize the tpaType value
        const validation = validateAndNormalizeTpaType(app.tpaType);
        if (!validation.isValid) {
            return {
                updated: false,
                skipped: false,
                error: validation.error,
                oldValue: String(app.tpaType)
            };
        }

        const normalizedAppType = validation.normalizedValue!;

        // Perform the update
        if (!DRY_RUN) {
            await App.findByIdAndUpdate(app._id, {
                $set: { appType: normalizedAppType }
                // Note: We intentionally do NOT unset tpaType to maintain backwards compatibility
            });
        }

        return {
            updated: true,
            skipped: false,
            oldValue: String(app.tpaType),
            newValue: normalizedAppType
        };

    } catch (error: any) {
        return {
            updated: false,
            skipped: false,
            error: error.message || error.toString(),
            oldValue: app.tpaType ? String(app.tpaType) : 'undefined'
        };
    }
}

/**
 * Main migration function
 */
async function migrate() {
    try {
        // Connect to MongoDB
        const dbUri = process.env.MONGO_URL || 'mongodb://localhost:27017/augmentos';
        logger.info(`Connecting to MongoDB: ${dbUri}`);

        await mongoose.connect(dbUri);
        logger.info('Connected to MongoDB');

        // Initialize counters
        let totalApps = 0;
        let appsProcessed = 0;
        let appsUpdated = 0;
        let appsSkipped = 0;
        let errorCount = 0;
        const errors: any[] = [];
        const valueMappings: Record<string, number> = {};

        // Construct query filter
        const query: any = {};

        // Add package filter if provided
        if (PACKAGE_FILTER) {
            query.packageName = { $regex: PACKAGE_FILTER };
        }

        // Only look for apps that have tpaType field
        query.tpaType = { $exists: true };

        // Get total count for progress tracking
        totalApps = await App.countDocuments(query);
        logger.info(`Found ${totalApps} apps with tpaType field to process`);

        if (totalApps === 0) {
            logger.info('No apps found with tpaType field');
            return;
        }

        // Process each app
        logger.info('Starting tpaType to appType migration...');
        const appCursor = App.find(query).cursor();

        for await (const app of appCursor) {
            appsProcessed++;
            logger.debug(`Processing app ${appsProcessed}/${totalApps}: ${app.packageName}`);

            const result = await migrateApp(app);

            if (result.updated) {
                appsUpdated++;
                logger.info(`✓ Updated ${app.packageName}: "${result.oldValue}" → "${result.newValue}"`);

                // Track value mappings for statistics
                const mappingKey = `${result.oldValue} → ${result.newValue}`;
                valueMappings[mappingKey] = (valueMappings[mappingKey] || 0) + 1;
            } else if (result.skipped) {
                appsSkipped++;
                logger.debug(`- Skipped ${app.packageName}: ${result.error}`);
            } else {
                errorCount++;
                logger.error(`✗ Error processing ${app.packageName}: ${result.error}`);
                errors.push({
                    packageName: app.packageName,
                    tpaType: result.oldValue,
                    error: result.error
                });
            }
        }

        // Log summary
        logger.info('=== Migration Summary ===');
        logger.info(`Total apps with tpaType: ${totalApps}`);
        logger.info(`Apps processed: ${appsProcessed}`);
        logger.info(`Apps updated: ${appsUpdated}`);
        logger.info(`Apps skipped: ${appsSkipped}`);
        logger.info(`Errors: ${errorCount}`);

        if (Object.keys(valueMappings).length > 0) {
            logger.info('\n=== Value Mappings ===');
            Object.entries(valueMappings).forEach(([mapping, count]) => {
                logger.info(`${mapping}: ${count} apps`);
            });
        }

        if (DRY_RUN) {
            logger.info('\nDRY RUN: No changes were made to the database');
        } else {
            logger.info('\nMigration completed successfully');
        }

        // Log errors if any
        if (errors.length > 0) {
            logger.warn('\n=== Errors Encountered ===');
            errors.forEach((err, index) => {
                logger.warn(`${index + 1}. ${err.packageName} (tpaType: ${err.tpaType}): ${err.error}`);
            });
        }

        // Log recommendations
        logger.info('\n=== Recommendations ===');
        if (errorCount > 0) {
            logger.info('🔧 Review apps with errors above - they may have invalid tpaType values');
        }
        if (appsSkipped > 0 && !FORCE_MODE) {
            logger.info('🔄 Use --force flag to update apps that already have appType set');
        }
        logger.info('📋 The tpaType field has been preserved for backwards compatibility');
        logger.info('🗑️  Consider removing tpaType field in a future migration after ensuring all clients use appType');

    } catch (error) {
        logger.error('Migration failed:', error);
        throw error;
    } finally {
        // Close database connection
        await mongoose.disconnect();
        logger.info('Database connection closed');
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    migrate().catch((error) => {
        logger.error('Migration script failed:', error);
        process.exit(1);
    });
}

export default migrate;