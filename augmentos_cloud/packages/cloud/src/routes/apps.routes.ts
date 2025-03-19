// cloud/src/routes/apps.routes.ts
import express, { Request, Response, NextFunction } from 'express';
import webSocketService from '../services/core/websocket.service';
import sessionService from '../services/core/session.service';
import appService from '../services/core/app.service';
import { User } from '../models/user.model';
import App, { AppI } from '../models/app.model';
import jwt, { JwtPayload } from 'jsonwebtoken';

export const CLOUD_VERSION = process.env.CLOUD_VERSION;
if (!CLOUD_VERSION) {
  console.error('CLOUD_VERSION is not set');
}


const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

/**
 * Helper function to get the active session for a user from their coreToken
 * @param coreToken JWT token from authentication
 * @returns The user's active session or null if not found
 */
async function getSessionFromToken(coreToken: string) {
  try {
    // Verify and decode the token
    const userData = jwt.verify(coreToken, AUGMENTOS_AUTH_JWT_SECRET);
    const userId = (userData as JwtPayload).email;

    if (!userId) {
      return null;
    }

    // Find the active session for this user
    const userSessions = sessionService.getSessionsForUser(userId);

    // Get the most recent active session for this user
    // We could add more sophisticated logic here if needed (e.g., device ID matching)
    if (userSessions && userSessions.length > 0) {
      return userSessions[0]; // Return the first active session
    }

    return null;
  } catch (error) {
    console.error('Error verifying token or finding session:', error);
    return null;
  }
}

/**
 * Middleware to extract session from Authorization header
 * Falls back to sessionId in body if Authorization header is not present
 */
async function sessionAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Check for Authorization header
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const session = await getSessionFromToken(token);

    if (session) {
      // Add session to request object for route handlers
      (req as any).userSession = session;
      next();
      return;
    }
  }

  // Fall back to sessionId in body
  if (req.body && req.body.sessionId) {
    const session = sessionService.getSession(req.body.sessionId);
    if (session) {
      (req as any).userSession = session;
      next();
      return;
    }
  }

  // No valid session found
  res.status(401).json({
    success: false,
    message: 'No valid session. Please provide valid Authorization Bearer token or sessionId.'
  });
}

const router = express.Router();

// Route Handlers
/**
 * Get all available apps
 */
async function getAllApps(req: Request, res: Response) {
  try {
    const apps = await appService.getAllApps();
    res.json({
      success: true,
      data: apps
    });
  } catch (error) {
    console.error('Error fetching apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching apps'
    });
  }
}

/**
 * Get public apps
 */
async function getPublicApps(req: Request, res: Response) {
  try {
    const apps = await appService.getAllApps();
    res.json({
      success: true,
      data: apps
    });
  } catch (error) {
    console.error('Error fetching public apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching public apps'
    });
  }
}

/**
 * Search apps by query
 */
async function searchApps(req: Request, res: Response) {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const apps = await appService.getAllApps();
    const searchResults = apps.filter(app =>
      app.name.toLowerCase().includes(query.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(query.toLowerCase()))
    );

    res.json({
      success: true,
      data: searchResults
    });
  } catch (error) {
    console.error('Error searching apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching apps'
    });
  }
}

/**
 * Get specific app by package name
 */
async function getAppByPackage(req: Request, res: Response) {
  try {
    const { packageName } = req.params;
    const app = await appService.getApp(packageName);

    if (!app) {
      return res.status(404).json({
        success: false,
        message: `App with package name ${packageName} not found`
      });
    }

    // If the app has a developerId, try to get the developer profile information
    let developerProfile = null;
    if (app.developerId) {
      try {
        const developer = await User.findByEmail(app.developerId);
        if (developer && developer.profile) {
          developerProfile = developer.profile;
        }
      } catch (err) {
        console.error('Error fetching developer profile:', err);
        // Continue without developer profile
      }
    }

    // Create response with developer profile if available
    // Convert app to plain object using spread operator to avoid TypeScript errors
    const appObj = { ...app };
    const appWithDeveloperInfo = {
      ...appObj,
      developerProfile
    };

    res.json({
      success: true,
      data: appWithDeveloperInfo
    });
  } catch (error) {
    console.error('Error fetching app:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching app'
    });
  }
}

/**
 * Start app for session
 */
async function startApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware

  try {
    await webSocketService.startAppSession(session, packageName);
    const appStateChange = await webSocketService.generateAppStateStatus(session);

    res.json({
      success: true,
      data: { 
        status: 'started', 
        packageName,
        appState: appStateChange 
      }
    });

    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    }
  } catch (error) {
    console.error(`Error starting app ${packageName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error starting app'
    });
  }
}

/**
 * Stop app for session 
 */
async function stopApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware

  try {
    const app = await appService.getApp(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

     // Call WebSocket service to stop the app with all the proper cleanup
     await webSocketService.stopAppSession(session, packageName);

     // Generate app state change to return
     const appStateChange = await webSocketService.generateAppStateStatus(session);

    res.json({
      success: true,
      data: { 
        status: 'stopped', 
        packageName,
        appState: appStateChange 
      }
    });

    // If the session has a websocket connection, also send the update there
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    }
  } catch (error) {
    console.error(`Error stopping app ${packageName}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error stopping app'
    });
  }
}

/**
 * Install app for user
 */
async function installApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware
  const email = session.userId;

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'User session and package name are required'
    });
  }

  try {
    // Find or create user
    const user = await User.findOrCreateUser(email);

    // Get app details
    const app = await appService.findFromAppStore(packageName);
    if (!app) {
      return res.status(404).json({
        success: false,
        message: 'App not found'
      });
    }

    // Check if app is already installed
    if (user.installedApps?.some(app => app.packageName === packageName)) {
      return res.status(400).json({
        success: false,
        message: 'App is already installed'
      });
    }

    // Add to installed apps
    if (!user.installedApps) {
      user.installedApps = [];
    }

    user.installedApps.push({
      packageName,
      installedDate: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: `App ${packageName} installed successfully`
    });

    // Generate app state change
    const appStateChange = await webSocketService.generateAppStateStatus(session);
    
    // Send update to websocket if connected
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    } else {
      // Fall back to session service if direct websocket not available
      try {
        sessionService.triggerAppStateChange(email);
      } catch (error) {
        console.error('Error triggering app state change:', error);
      }
    }
  } catch (error) {
    console.error('Error installing app:', error);
    res.status(500).json({
      success: false,
      message: 'Error installing app'
    });
  }
}

/**
 * Uninstall app for user
 */
async function uninstallApp(req: Request, res: Response) {
  const { packageName } = req.params;
  const session = (req as any).userSession; // Get session from middleware
  const email = session.userId;

  if (!email || !packageName) {
    return res.status(400).json({
      success: false,
      message: 'User session and package name are required'
    });
  }

  try {
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove from installed apps
    if (!user.installedApps) {
      return res.status(400).json({
        success: false,
        message: 'App is not installed'
      });
    }

    user.installedApps = user.installedApps.filter(
      app => app.packageName !== packageName
    );

    await user.save();

    res.json({
      success: true,
      message: `App ${packageName} uninstalled successfully`
    });

    // Generate app state change
    const appStateChange = await webSocketService.generateAppStateStatus(session);
    
    // Send update to websocket if connected
    if (session.websocket && session.websocket.readyState === 1) {
      session.websocket.send(JSON.stringify(appStateChange));
    } else {
      // Fall back to session service if direct websocket not available
      try {
        sessionService.triggerAppStateChange(email);
      } catch (error) {
        console.error('Error triggering app state change:', error);
      }
    }
  } catch (error) {
    console.error('Error uninstalling app:', error);
    res.status(500).json({
      success: false,
      message: 'Error uninstalling app'
    });
  }
}

/**
 * Get installed apps for user
 */
async function getInstalledApps(req: Request, res: Response) {
  const session = (req as any).userSession; // Get session from middleware
  const email = session.userId;

  try {
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get details for all installed apps
    const installedApps = await Promise.all(
      (user.installedApps || []).map(async (installedApp) => {
        const appDetails = await appService.getApp(installedApp.packageName);
        if (!appDetails) return null;
        return {
          ...appDetails,
          installedDate: installedApp.installedDate
        };
      })
    );

    // Filter out null entries (in case an app was deleted)
    const validApps = installedApps.filter(app => app !== null);

    res.json({
      success: true,
      data: validApps
    });
  } catch (error) {
    console.error('Error fetching installed apps:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching installed apps'
    });
  }
}

  /**
   * Get app details by package name
   * Public endpoint - no authentication required
   */
  async function getAppDetails (req: Request, res: Response) {
    try {
      const { packageName } = req.params;

      // Get app details
      const app = await appService.getAppByPackageName(packageName);

      if (!app) {
        return res.status(404).json({
          success: false,
          message: `App with package name ${packageName} not found`
        });
      }

      // If the app has a developerId, try to get the developer profile information
      let developerProfile = null;
      if (app.developerId) {
        try {
          const developer = await User.findByEmail(app.developerId);
          if (developer && developer.profile) {
            developerProfile = developer.profile;
          }
        } catch (err) {
          console.error('Error fetching developer profile:', err);
          // Continue without developer profile
        }
      }

      // Create response with developer profile if available
      // Convert app to plain object to avoid TypeScript errors
      const appObj = { ...app };
      const appWithDeveloperInfo = {
        ...appObj,
        developerProfile
      };

      res.json({
        success: true,
        data: appWithDeveloperInfo
      });
    } catch (error) {
      console.error('Error fetching app details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch app details'
      });
    }
  };

async function getAvailableApps (req: Request, res: Response) {
  try {
    const apps = await appService.getAvailableApps();

    // Return the apps with success flag
    res.json({
      success: true,
      data: apps
    });
  } catch (error) {
    console.error('Error fetching available apps:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available apps'
    });
  }
};

// Route Definitions
router.get('/', getAllApps);
router.get('/public', getPublicApps);
router.get('/search', searchApps);
router.get('/installed', sessionAuthMiddleware, getInstalledApps);
router.post('/install/:packageName', sessionAuthMiddleware, installApp);
router.post('/uninstall/:packageName', sessionAuthMiddleware, uninstallApp);
// Keep backward compatibility for now (can be removed later)
// router.post('/install/:packageName/:email', installApp);
// router.post('/uninstall/:packageName/:email', uninstallApp);
// router.get('/install/:packageName/:email', installApp);
// router.get('/uninstall/:packageName/:email', uninstallApp);

router.get('/version', async (req, res) => {
  res.json({ version: CLOUD_VERSION });
});

router.get('/available', getAvailableApps);
router.get('/:packageName', getAppByPackage);
router.post('/:packageName/start', sessionAuthMiddleware, startApp);
router.post('/:packageName/stop', sessionAuthMiddleware, stopApp);

export default router;
