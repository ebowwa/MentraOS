/**
 * Dashboard Manager TPA
 * 
 * This is the system dashboard TPA that manages system information
 * display and dashboard mode control. It uses the AugmentOS SDK's
 * dashboard.system API to update dashboard sections and control modes.
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  TpaSession,
  DashboardMode,
  ViewType,
  StreamType
} from '@augmentos/sdk';
import { logger, wrapText } from '@augmentos/utils';
import tzlookup from 'tz-lookup';

// Session information interface
interface SessionInfo {
  userId: string;
  session: TpaSession;
  batteryLevel?: number;
  latestLocation?: { latitude: number; longitude: number; timezone?: string };
  phoneNotificationCache: { title: string; content: string; timestamp: number; uuid: string }[];
  phoneNotificationRanking?: { summary: string; timestamp: number }[];
  calendarEvent?: any;
  weatherCache?: { timestamp: number; data: string };
  dashboardMode: DashboardMode;
  updateInterval?: NodeJS.Timeout;
}

// Active session management
const activeSessions = new Map<string, SessionInfo>();
const notificationAppBlackList = ['youtube', 'augment', 'maps'];

/**
 * Initialize a new dashboard session for a user
 * @param sessionId Unique session identifier
 * @param userId User identifier
 * @param apiKey API key for authorization
 * @param wsUrl WebSocket server URL
 */
export async function initializeDashboardSession(
  sessionId: string, 
  userId: string,
  apiKey: string,
  wsUrl: string
): Promise<void> {
  // Clean up any existing session with this ID
  cleanupSession(sessionId);
  
  // Create new TPA session
  const session = new TpaSession({
    packageName: 'system.augmentos.dashboard',
    apiKey,
    augmentOSWebsocketUrl: wsUrl
  });
  
  // Initialize session info
  const sessionInfo: SessionInfo = {
    userId,
    session,
    phoneNotificationCache: [],
    dashboardMode: DashboardMode.MAIN
  };
  
  activeSessions.set(sessionId, sessionInfo);
  
  // Connect to AugmentOS Cloud
  try {
    await session.connect(sessionId);
    logger.info(`Dashboard session ${sessionId} connected to AugmentOS Cloud`);
    
    // Set up event handlers
    setupEventHandlers(sessionId, session);
    
    // Initialize dashboard content
    initializeDashboard(sessionId);
    
    return;
  } catch (error) {
    logger.error(`Failed to connect dashboard session ${sessionId}:`, error);
    cleanupSession(sessionId);
    throw error;
  }
}

/**
 * Clean up resources for a session
 * @param sessionId Session to clean up
 */
function cleanupSession(sessionId: string): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  
  // Clear update interval if it exists
  if (sessionInfo.updateInterval) {
    clearInterval(sessionInfo.updateInterval);
  }
  
  // Disconnect session if it exists
  try {
    sessionInfo.session.disconnect();
  } catch (error) {
    logger.error(`Error disconnecting session ${sessionId}:`, error);
  }
  
  // Remove from active sessions
  activeSessions.delete(sessionId);
  logger.info(`Cleaned up dashboard session ${sessionId}`);
}

/**
 * Set up event handlers for dashboard session
 * @param sessionId Session identifier
 * @param session TPA session
 */
function setupEventHandlers(sessionId: string, session: TpaSession): void {
  // Handle phone notifications
  session.onPhoneNotifications((data) => {
    handlePhoneNotification(sessionId, data);
  });
  
  // Handle location updates
  session.on(StreamType.LOCATION_UPDATE, (data) => {
    handleLocationUpdate(sessionId, data);
  });
  
  // Handle head position changes
  session.onHeadPosition((data) => {
    if (data.position === 'up') {
      updateDashboardSections(sessionId);
    }
  });
  
  // Handle battery updates
  session.on(StreamType.GLASSES_BATTERY_UPDATE, (data) => {
    handleBatteryUpdate(sessionId, data);
  });
  
  // Handle calendar events
  session.on(StreamType.CALENDAR_EVENT, (data) => {
    handleCalendarEvent(sessionId, data);
  });
  
  // Handle dashboard mode changes (from cloud side)
  session.dashboard.content.onModeChange((mode) => {
    if (mode === 'none') return;
    
    const sessionInfo = activeSessions.get(sessionId);
    if (!sessionInfo) return;
    
    sessionInfo.dashboardMode = mode;
    logger.info(`Dashboard mode changed to ${mode} for session ${sessionId}`);
    updateDashboardSections(sessionId);
  });
  
  // Handle session disconnection
  session.events.on('disconnected', (reason) => {
    logger.info(`Dashboard session ${sessionId} disconnected: ${reason}`);
    cleanupSession(sessionId);
  });
  
  // Handle errors
  session.events.on('error', (error) => {
    logger.error(`Dashboard session ${sessionId} error:`, error);
  });
}

/**
 * Initialize dashboard content and start update interval
 * @param sessionId Session identifier
 */
function initializeDashboard(sessionId: string): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  
  // Set dashboard to main mode
  sessionInfo.session.dashboard.system?.setViewMode(DashboardMode.MAIN);
  sessionInfo.dashboardMode = DashboardMode.MAIN;
  
  // Initialize dashboard sections
  updateDashboardSections(sessionId);
  
  // Start dashboard update interval
  sessionInfo.updateInterval = setInterval(() => {
    updateDashboardSections(sessionId);
  }, 60000);
}

/**
 * Update all dashboard sections with current data
 * @param sessionId Session identifier
 */
function updateDashboardSections(sessionId: string): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  
  const { session } = sessionInfo;
  
  // Format time section
  const timeText = formatTimeSection(sessionInfo);
  session.dashboard.system?.setTopLeft(timeText);
  
  // Format battery section
  const batteryText = formatBatterySection(sessionInfo);
  session.dashboard.system?.setTopRight(batteryText);
  
  // Format notification section
  const notificationText = formatNotificationSection(sessionInfo);
  session.dashboard.system?.setBottomLeft(notificationText);
  
  // Format status section
  const statusText = formatStatusSection(sessionInfo);
  session.dashboard.system?.setBottomRight(statusText);
}

// ===================================
// Section Formatters
// ===================================

function formatTimeSection(sessionInfo: SessionInfo): string {
  // Check if we have a valid timezone from location
  if (!sessionInfo.latestLocation?.timezone) {
    return "◌ $DATE$, $TIME12$";
  }

  try {
    const timezone = sessionInfo.latestLocation.timezone;
    const options = {
      timeZone: timezone,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
      month: "numeric" as const,
      day: "numeric" as const,
      hour12: true
    };
    let formatted = new Date().toLocaleString("en-US", options);
    formatted = formatted.replace(/ [AP]M/, "");
    return `◌ ${formatted}`;
  } catch (error) {
    logger.error(`Error formatting time:`, error);
    return "◌ $DATE$, $TIME12$";
  }
}

function formatBatterySection(sessionInfo: SessionInfo): string {
  return (typeof sessionInfo.batteryLevel === 'number')
    ? `${sessionInfo.batteryLevel}%`
    : "$GBATT$";
}

function formatNotificationSection(sessionInfo: SessionInfo): string {
  // Use ranked notifications if available, otherwise use the raw cache
  const notifications = sessionInfo.phoneNotificationRanking || 
                      sessionInfo.phoneNotificationCache || [];
  
  if (notifications.length === 0) return "";

  // Take the latest 2 notifications
  const topNotifications = notifications.slice(0, 2);
  
  // Format differently based on whether we're using ranked or raw notifications
  if ('summary' in topNotifications[0]) {
    return topNotifications
      .map(notification => wrapText((notification as { summary: string; timestamp: number; }).summary, 25))
      .join('\n');
  } else {
    return topNotifications
      .map(notification => `${(notification as { title: string; content: string; timestamp: number; uuid: string }).title}: ${(notification as { title: string; content: string; timestamp: number; uuid: string }).content}`)
      .join('\n');
  }
}

function formatStatusSection(sessionInfo: SessionInfo): string {
  // Prioritize calendar events if available
  if (sessionInfo.calendarEvent) {
    return formatCalendarEvent(sessionInfo.calendarEvent);
  }
  
  // Then weather if available
  if (sessionInfo.weatherCache) {
    return sessionInfo.weatherCache.data;
  }
  
  // Default status
  return "Status: Connected";
}

function formatCalendarEvent(event: any): string {
  try {
    const eventDate = new Date(event.dtStart);
    const formattedTime = eventDate.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true 
    }).replace(" ", "");
    
    const title = event.title.length > 10 
      ? event.title.substring(0, 10).trim() + '...' 
      : event.title;
    
    return `${title} @ ${formattedTime}`;
  } catch (error) {
    logger.error('Error formatting calendar event', error);
    return "Calendar event";
  }
}

// ===================================
// Event Handlers
// ===================================

function handlePhoneNotification(sessionId: string, data: any): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Check if the app name is blacklisted
  if (data.app && notificationAppBlackList.some(app => 
    data.app.toLowerCase().includes(app))) {
    logger.debug(`Notification from ${data.app} is blacklisted.`);
    return;
  }

  // Add notification to cache
  const newNotification = {
    title: data.title || 'No Title',
    content: data.content || '',
    timestamp: Date.now(),
    uuid: uuidv4()
  };

  // Prevent duplicate notifications
  const cache = sessionInfo.phoneNotificationCache;
  if (cache.length > 0) {
    const lastNotification = cache[cache.length - 1];
    if (lastNotification.title === newNotification.title &&
        lastNotification.content === newNotification.content) {
      logger.debug(`Duplicate notification detected. Not adding to cache.`);
      return;
    }
  }

  // Add to cache
  sessionInfo.phoneNotificationCache.push(newNotification);
  
  // Process notifications (rank them)
  sessionInfo.phoneNotificationRanking = sessionInfo.phoneNotificationCache
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(notification => ({
      summary: `${notification.title}: ${notification.content}`,
      timestamp: notification.timestamp
    }));
  
  // Update dashboard sections
  updateDashboardSections(sessionId);
}

function handleLocationUpdate(sessionId: string, data: any): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Extract lat, lng from location data
  const { lat, lng } = data;
  
  // Skip if invalid coordinates
  if (typeof lat !== "number" || typeof lng !== "number") {
    logger.error(`Invalid location data:`, data);
    return;
  }
  
  // Determine timezone from coordinates
  let timezone: string | undefined;
  try {
    timezone = tzlookup(lat, lng);
  } catch (error) {
    logger.error(`Error looking up timezone for lat=${lat}, lng=${lng}:`, error);
  }
  
  // Update location in session
  sessionInfo.latestLocation = { 
    latitude: lat, 
    longitude: lng,
    timezone: timezone || sessionInfo.latestLocation?.timezone
  };

  // Update dashboard with location info
  updateDashboardSections(sessionId);
}

function handleBatteryUpdate(sessionId: string, data: any): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Update battery level if it changed
  if (typeof data.level === 'number' && sessionInfo.batteryLevel !== data.level) {
    sessionInfo.batteryLevel = data.level;
    updateDashboardSections(sessionId);
  }
}

function handleCalendarEvent(sessionId: string, event: any): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;

  // Validate event structure
  if (!event.title || !event.dtStart) {
    logger.error(`Invalid calendar event structure:`, event);
    return;
  }

  // Update calendar event
  sessionInfo.calendarEvent = event;
  updateDashboardSections(sessionId);
}

/**
 * Change the dashboard mode
 * @param sessionId Session identifier
 * @param mode New dashboard mode
 */
export function changeDashboardMode(sessionId: string, mode: DashboardMode): void {
  const sessionInfo = activeSessions.get(sessionId);
  if (!sessionInfo) return;
  
  // Update local state
  sessionInfo.dashboardMode = mode;
  
  // Set mode in the cloud
  sessionInfo.session.dashboard.system?.setViewMode(mode);
  
  // Update dashboard sections for the new mode
  updateDashboardSections(sessionId);
}

/**
 * Get all active dashboard sessions
 * @returns Array of session IDs
 */
export function getActiveSessions(): string[] {
  return Array.from(activeSessions.keys());
}

/**
 * Update dashboard settings for a specific user
 * @param userId User identifier
 * @param settings New settings
 */
export function updateUserSettings(userId: string, settings: any): void {
  // Find all sessions for this user
  for (const [sessionId, sessionInfo] of activeSessions.entries()) {
    if (sessionInfo.userId === userId) {
      // Apply settings (if we had any user-specific settings)
      updateDashboardSections(sessionId);
    }
  }
}

/**
 * Force update all dashboard sections for all sessions
 */
export function updateAllDashboards(): void {
  for (const sessionId of activeSessions.keys()) {
    updateDashboardSections(sessionId);
  }
}