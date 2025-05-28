/**
 * Migration script: Import TPA Configurations from Server Files
 *
 * This migration:
 * 1. Fetches all apps from the database
 * 2. For each app that has a publicUrl, attempts to fetch tpa_config.json from {publicUrl}/tpa_config.json
 * 3. Validates the configuration using the same logic as the frontend
 * 4. Updates the database with the imported configuration (name, description, settings, tools, permissions)
 * 5. Preserves existing database data for fields not present in tpa_config.json
 *
 * Usage:
 * ts-node -r tsconfig-paths/register scripts/migrations/002-import-tpa-configs.ts
 *
 * Options:
 * --dry-run         Check what would happen without making changes
 * --package-filter  Only process apps with package name matching pattern (supports regex)
 * --force           Import configs even if app already has settings/tools in database
 * --timeout         HTTP timeout in seconds (default: 10)
 * --skip-ssl        Skip SSL certificate verification (use with caution)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import App, { AppI, Permission, PermissionType } from '../../src/models/app.model';
import { logger as rootLogger } from '../../src/services/logging/pino-logger';
import { AppSetting, AppSettingType, ToolSchema } from '@augmentos/sdk';

// Configure environment
dotenv.config();

const logger = rootLogger.child({ migration: '002-import-tpa-configs' });
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE_MODE = process.argv.includes('--force');
const SKIP_SSL = process.argv.includes('--skip-ssl');

// Parse command line arguments
const PACKAGE_FILTER_ARG = process.argv.find(arg => arg.startsWith('--package-filter='));
const PACKAGE_FILTER = PACKAGE_FILTER_ARG ? PACKAGE_FILTER_ARG.split('=')[1] : null;

const TIMEOUT_ARG = process.argv.find(arg => arg.startsWith('--timeout='));
const TIMEOUT_SECONDS = TIMEOUT_ARG ? parseInt(TIMEOUT_ARG.split('=')[1]) : 10;

if (DRY_RUN) {
  logger.info('DRY RUN MODE: No changes will be made to the database');
}

if (PACKAGE_FILTER) {
  logger.info(`Package filter mode: Only processing apps with package name matching: ${PACKAGE_FILTER}`);
}

if (FORCE_MODE) {
  logger.info('Force mode: Will import configs even for apps that already have settings/tools in database');
}

if (SKIP_SSL) {
  logger.warn('SSL verification disabled - use with caution');
}

logger.info(`HTTP timeout set to ${TIMEOUT_SECONDS} seconds`);

/**
 * Interface for TPA configuration as expected from tpa_config.json
 */
interface TpaConfigFile {
  name: string;
  description: string;
  version?: string;
  publicUrl?: string;
  logoURL?: string;
  webviewURL?: string;
  settings: AppSetting[];
  tools?: ToolSchema[];
  permissions?: Permission[];
}

/**
 * Validates a TPA configuration object structure and returns detailed error information
 * Based on the validation logic from EditTPA.tsx
 * @param config - Object to validate
 * @returns Object with validation result and specific error message
 */
function validateTpaConfig(config: any): { isValid: boolean; error?: string } {
  if (!config || typeof config !== 'object') {
    return { isValid: false, error: 'Configuration file must contain a valid JSON object.' };
  }

  // Check required string properties - name and description are required
  if (typeof config.name !== 'string' || config.name.trim() === '') {
    return { isValid: false, error: 'Missing required field: "name" must be a non-empty string.' };
  }

  if (typeof config.description !== 'string' || config.description.trim() === '') {
    return { isValid: false, error: 'Missing required field: "description" must be a non-empty string.' };
  }

  // Version is optional but if present, must be a string
  if (config.version !== undefined && typeof config.version !== 'string') {
    return { isValid: false, error: 'Optional field "version" must be a string if provided.' };
  }

  // Settings array is optional but must be an array if provided
  if (config.settings !== undefined && !Array.isArray(config.settings)) {
    return { isValid: false, error: 'Optional field "settings" must be an array if provided.' };
    }

  if (config.settings === undefined) {
    config.settings = [];
  }

  // Optional fields validation - if present, must be correct type
  if (config.tools !== undefined && !Array.isArray(config.tools)) {
    return { isValid: false, error: 'Optional field "tools" must be an array if provided.' };
  }

  if (config.permissions !== undefined && !Array.isArray(config.permissions)) {
    return { isValid: false, error: 'Optional field "permissions" must be an array if provided.' };
  }

  if (config.publicUrl !== undefined && (typeof config.publicUrl !== 'string' || config.publicUrl.trim() === '')) {
    return { isValid: false, error: 'Optional field "publicUrl" must be a non-empty string if provided.' };
  }

  if (config.logoURL !== undefined && (typeof config.logoURL !== 'string' || config.logoURL.trim() === '')) {
    return { isValid: false, error: 'Optional field "logoURL" must be a non-empty string if provided.' };
  }

  // webviewURL can be empty string (treated as "not there"), but if present must be a string
  if (config.webviewURL !== undefined && typeof config.webviewURL !== 'string') {
    return { isValid: false, error: 'Optional field "webviewURL" must be a string if provided.' };
    }

  // Validate each setting (but allow empty settings array)
  for (let index = 0; index < config.settings.length; index++) {
    const setting = config.settings[index];

    // Group settings just need a title
    if (setting.type === 'group') {
      if (typeof setting.title !== 'string') {
        return { isValid: false, error: `Setting ${index + 1}: Group type requires a "title" field with a string value.` };
      }
      continue;
    }

    // TITLE_VALUE settings just need label and value
    if (setting.type === 'titleValue') {
      if (typeof setting.label !== 'string') {
        return { isValid: false, error: `Setting ${index + 1}: TitleValue type requires a "label" field with a string value.` };
      }
      if (!('value' in setting)) {
        return { isValid: false, error: `Setting ${index + 1}: TitleValue type requires a "value" field.` };
      }
      continue;
    }

    // Regular settings need key and label and type
    if (typeof setting.key !== 'string' || typeof setting.label !== 'string' || typeof setting.type !== 'string') {
      return { isValid: false, error: `Setting ${index + 1}: Missing required fields "key", "label", or "type" (all must be strings).` };
    }

    // Type-specific validation
    switch (setting.type) {
      case 'toggle':
        if (setting.defaultValue !== undefined && typeof setting.defaultValue !== 'boolean') {
          return { isValid: false, error: `Setting ${index + 1}: Toggle type requires "defaultValue" to be a boolean if provided.` };
        }
        break;

      case 'text':
      case 'text_no_save_button':
        if (setting.defaultValue !== undefined && typeof setting.defaultValue !== 'string') {
          return { isValid: false, error: `Setting ${index + 1}: Text type requires "defaultValue" to be a string if provided.` };
        }
        break;

      case 'select':
      case 'select_with_search':
        if (!Array.isArray(setting.options)) {
          return { isValid: false, error: `Setting ${index + 1}: Select type requires an "options" array.` };
        }
        for (let optIndex = 0; optIndex < setting.options.length; optIndex++) {
          const opt = setting.options[optIndex];
          if (typeof opt.label !== 'string' || !('value' in opt)) {
            return { isValid: false, error: `Setting ${index + 1}, Option ${optIndex + 1}: Each option must have "label" (string) and "value" fields.` };
          }
        }
        break;

      case 'multiselect':
        if (!Array.isArray(setting.options)) {
          return { isValid: false, error: `Setting ${index + 1}: Multiselect type requires an "options" array.` };
        }
        for (let optIndex = 0; optIndex < setting.options.length; optIndex++) {
          const opt = setting.options[optIndex];
          if (typeof opt.label !== 'string' || !('value' in opt)) {
            return { isValid: false, error: `Setting ${index + 1}, Option ${optIndex + 1}: Each option must have "label" (string) and "value" fields.` };
          }
        }
        if (setting.defaultValue !== undefined && !Array.isArray(setting.defaultValue)) {
          return { isValid: false, error: `Setting ${index + 1}: Multiselect type requires "defaultValue" to be an array if provided.` };
        }
        break;

      case 'slider':
        if (typeof setting.defaultValue !== 'number' ||
            typeof setting.min !== 'number' ||
            typeof setting.max !== 'number' ||
            setting.min > setting.max) {
          return { isValid: false, error: `Setting ${index + 1}: Slider type requires "defaultValue", "min", and "max" to be numbers, with min ≤ max.` };
        }
        break;

      default:
        return { isValid: false, error: `Setting ${index + 1}: Unknown setting type "${setting.type}". Supported types: toggle, text, text_no_save_button, select, select_with_search, multiselect, slider, group, titleValue.` };
    }
  }

  return { isValid: true };
}

/**
 * Normalizes a URL by ensuring it has https:// and removing trailing slashes
 * Based on the normalizeUrl function from the frontend
 * @param url - URL to normalize
 * @returns Normalized URL
 */
function normalizeUrl(url: string): string {
  if (!url || url.trim() === '') {
    return '';
  }

  let normalized = url.trim();

  // Add https:// if no protocol specified
  if (!normalized.match(/^https?:\/\//)) {
    normalized = `https://${normalized}`;
  }

  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

/**
 * Fetches a URL and returns the response body as a string
 * @param url - URL to fetch
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise resolving to response body string
 */
function fetchUrl(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'AugmentOS-Migration-Script/1.0',
        'Accept': 'application/json, text/plain, */*'
      },
      // Skip SSL certificate verification if requested
      ...(SKIP_SSL && isHttps ? { rejectUnauthorized: false } : {})
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Attempts to fetch and parse tpa_config.json from an app's server
 * @param app - App document from database
 * @returns Promise resolving to parsed config or null if not found/invalid
 */
async function fetchTpaConfig(app: AppI): Promise<TpaConfigFile | null> {
  if (!app.publicUrl || app.publicUrl.trim() === '') {
    logger.debug(`App ${app.packageName} has no publicUrl, skipping`);
    return null;
  }

  try {
    const normalizedUrl = normalizeUrl(app.publicUrl);
    const configUrl = `${normalizedUrl}/tpa_config.json`;

    logger.debug(`Fetching config from: ${configUrl}`);

    const response = await fetchUrl(configUrl, TIMEOUT_SECONDS * 1000);

    if (!response || response.trim() === '') {
      logger.debug(`Empty response from ${configUrl}`);
      return null;
    }

    let config;
    try {
      config = JSON.parse(response);
    } catch (parseError) {
      logger.warn(`JSON parse error for ${app.packageName}: ${parseError}`);
      return null;
    }

    // Validate configuration structure
    const validation = validateTpaConfig(config);
    if (!validation.isValid) {
      logger.warn(`Invalid config structure for ${app.packageName}: ${validation.error}`);
      return null;
    }

    logger.info(`Successfully fetched and validated config for ${app.packageName}`);
    return config as TpaConfigFile;

  } catch (error) {
    if (error instanceof Error) {
      // Log at debug level for common errors to avoid noise
      if (error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('timeout') ||
          error.message.includes('HTTP 404')) {
        logger.debug(`Config not available for ${app.packageName}: ${error.message}`);
      } else {
        logger.warn(`Error fetching config for ${app.packageName}: ${error.message}`);
      }
    } else {
      logger.warn(`Unknown error fetching config for ${app.packageName}: ${error}`);
    }
    return null;
  }
}

/**
 * Recursively removes _id fields and empty options/enum arrays from objects and arrays
 * Based on removeIdFields function from EditTPA.tsx
 * @param obj - The object or array to clean
 * @returns The cleaned object without _id fields and empty options/enum arrays
 */
function removeIdFields(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeIdFields);
  } else if (obj !== null && typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip any field that is exactly "_id"
      if (key !== '_id') {
        // Skip empty options or enum arrays
        if ((key === 'options' || key === 'enum') && Array.isArray(value) && value.length === 0) {
          continue;
        }
        cleaned[key] = removeIdFields(value);
      }
    }
    return cleaned;
  }
  return obj;
}

/**
 * Updates an app in the database with imported configuration
 * @param app - App document to update
 * @param config - Configuration data to import
 * @returns Promise resolving to update result summary
 */
async function updateAppWithConfig(app: AppI, config: TpaConfigFile): Promise<{
  fieldsUpdated: string[];
  settingsCount: number;
  toolsCount: number;
  permissionsCount: number;
}> {
  const fieldsUpdated: string[] = [];
  const updateData: any = {};

  // Always replace settings with imported data (can be empty arrays)
  updateData.settings = removeIdFields(config.settings || []);
  fieldsUpdated.push('settings');

  // Always replace tools with imported data (can be empty arrays)
  updateData.tools = removeIdFields(config.tools || []);
  fieldsUpdated.push('tools');

  // Perform the update
  if (!DRY_RUN) {
    await App.findByIdAndUpdate(app._id, { $set: updateData });
  }

  return {
    fieldsUpdated,
    settingsCount: (config.settings || []).length,
    toolsCount: (config.tools || []).length,
    permissionsCount: (config.permissions || []).length
  };
}

/**
 * Main migration function
 */
async function migrate() {
  try {
    // Connect to MongoDB
    const dbUri = process.env.MONGO_URL || 'mongodb://localhost:27017/augmentos';
    logger.info(`Connecting to MongoDB: ${dbUri}`);

    await mongoose.connect(dbUri + "/prod");
    logger.info('Connected to MongoDB');

    // Initialize counters
    let totalApps = 0;
    let appsProcessed = 0;
    let configsFound = 0;
    let configsImported = 0;
    let appsSkipped = 0;
    let errorCount = 0;
    const errors: any[] = [];

    // Construct query filter based on package name pattern if provided
    const query: any = {};
    if (PACKAGE_FILTER) {
      query.packageName = { $regex: PACKAGE_FILTER };
    }

    // Get total count for progress tracking
    totalApps = await App.countDocuments(query);
    logger.info(`Found ${totalApps} apps to process`);

    if (totalApps === 0) {
      logger.info('No apps found matching criteria');
      return;
    }

    // Process each app
    logger.info('Starting app configuration import...');
    const appCursor = App.find(query).cursor();

    for await (const app of appCursor) {
      appsProcessed++;
      logger.info(`Processing app ${appsProcessed}/${totalApps}: ${app.packageName}`);

      try {
        // Skip apps that already have settings/tools unless in force mode
        if (!FORCE_MODE) {
          const hasExistingData = (app.settings && app.settings.length > 0) ||
                                  (app.tools && app.tools.length > 0);

          if (hasExistingData) {
            logger.debug(`App ${app.packageName} already has settings/tools, skipping (use --force to override)`);
            appsSkipped++;
            continue;
          }
        }

        // Attempt to fetch tpa_config.json
        const config = await fetchTpaConfig(app);

        if (!config) {
          logger.debug(`No valid config found for ${app.packageName}`);
          continue;
        }

        configsFound++;

        // Update app with imported configuration
        const updateResult = await updateAppWithConfig(app, config);
        configsImported++;

        logger.info(`Successfully imported config for ${app.packageName}:`);
        logger.info(`  - Fields updated: ${updateResult.fieldsUpdated.join(', ')}`);
        logger.info(`  - Settings: ${updateResult.settingsCount}`);
        logger.info(`  - Tools: ${updateResult.toolsCount}`);
        logger.info(`  - Permissions: ${updateResult.permissionsCount}`);

      } catch (error: any) {
        errorCount++;
        logger.error(`Error processing app ${app.packageName}:`, error);
        errors.push({
          packageName: app.packageName,
          error: error.message || error.toString()
        });
      }
    }

    // Log summary
    logger.info('=== Migration Summary ===');
    logger.info(`Total apps: ${totalApps}`);
    logger.info(`Apps processed: ${appsProcessed}`);
    logger.info(`Apps skipped (already had data): ${appsSkipped}`);
    logger.info(`Configs found: ${configsFound}`);
    logger.info(`Configs imported: ${configsImported}`);
    logger.info(`Errors: ${errorCount}`);

    if (DRY_RUN) {
      logger.info('DRY RUN: No changes were made to the database');
    }

    // Log errors if any
    if (errors.length > 0) {
      logger.warn('=== Errors Encountered ===');
      errors.forEach((err, index) => {
        logger.warn(`${index + 1}. ${err.packageName}: ${err.error}`);
      });
    }

    logger.info('Migration completed successfully');

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