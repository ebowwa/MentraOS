import { Request, Response, NextFunction } from 'express';

// Extend Request interface to include SDK authentication data
declare global {
  namespace Express {
    interface Request {
      sdkAuth?: {
        packageName: string;
        apiKey: string;
        userId?: string;
      };
    }
  }
}

/**
 * SDK Authentication Middleware
 * 
 * Authenticates requests using Authorization header:
 * Authorization: Bearer <packageName>:<MENTRAOS_APP_API_KEY>
 * 
 * Usage:
 * - Apply to /api/sdk/* routes that require authentication (right now only applied to sdkAuthMiddleware)
 * - Populates req.sdkAuth with packageName and apiKey
 */
export const authenticateSDK = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'Missing Authorization header',
        message: 'Authorization header is required for SDK requests'
      });
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Invalid Authorization format',
        message: 'Authorization header must be in format: Bearer <packageName>:<apiKey>'
      });
    }

    // Extract the token part after "Bearer "
    const token = authHeader.substring(7);

    // Split by colon to get packageName and apiKey
    const parts = token.split(':');
    
    if (parts.length !== 2) {
      return res.status(401).json({
        error: 'Invalid token format',
        message: 'Token must be in format: <packageName>:<apiKey>'
      });
    }

    const [packageName, apiKey] = parts;

    // Validate packageName and apiKey are not empty
    if (!packageName || !apiKey) {
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Both packageName and apiKey must be provided'
      });
    }

    // TODO: Add actual API key validation against database
    // For now, we just validate the format and store the credentials
    
    // Store authentication data in request for use by route handlers
    req.sdkAuth = {
      packageName,
      apiKey
    };

    // Continue to next middleware/route handler
    next();
  } catch (error) {
    console.error('SDK authentication error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Optional middleware to extract userId from request body/query
 * Use this after authenticateSDK when you need userId validation
 */
export const extractUserId = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get userId from body (POST/PUT/DELETE) or query (GET)
    const userId = req.body?.userId || req.query?.userId;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing userId',
        message: 'userId is required in request body or query parameters'
      });
    }

    // Add userId to SDK auth data
    if (req.sdkAuth) {
      req.sdkAuth.userId = userId as string;
    }

    next();
  } catch (error) {
    console.error('UserId extraction error:', error);
    return res.status(500).json({
      error: 'UserId extraction failed',
      message: 'Internal server error during userId extraction'
    });
  }
};

/**
 * Middleware to validate packageName matches the one in the JWT token
 * Use this when packageName is provided in request body and must match auth
 */
export const validatePackageName = (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestPackageName = req.body?.packageName || req.query?.packageName;
    const authPackageName = req.sdkAuth?.packageName;

    if (!requestPackageName) {
      return res.status(400).json({
        error: 'Missing packageName',
        message: 'packageName is required in request'
      });
    }

    if (requestPackageName !== authPackageName) {
      return res.status(403).json({
        error: 'Package name mismatch',
        message: 'Request packageName must match authenticated packageName'
      });
    }

    next();
  } catch (error) {
    console.error('Package name validation error:', error);
    return res.status(500).json({
      error: 'Package validation failed',
      message: 'Internal server error during package name validation'
    });
  }
};

// Combine common middleware for SDK routes
export const sdkAuthMiddleware = [
  authenticateSDK,
  extractUserId,
  validatePackageName
];