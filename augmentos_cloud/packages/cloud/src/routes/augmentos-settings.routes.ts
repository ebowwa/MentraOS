import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { logger } from '@augmentos/utils';

export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

const router = express.Router();

// GET /augmentos-settings
// Returns the user's AugmentOS settings
router.get('/', async (req, res) => {
  logger.info('Received request for AugmentOS settings');

  // Validate the Authorization header
  const authHeader = req.headers.authorization;
  console.log('Request headers:', req.headers);
  console.log('Authorization header:', authHeader);
  
  if (!authHeader) {
    console.log('No authorization header found');
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Extracted token:', token);
  
  if (!token) {
    console.log('No token found in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    // Find or create the user
    const user = await User.findOrCreateUser(userId);

    // Get the settings
    const settings = user.getAugmentosSettings();

    return res.json({
      success: true,
      userId,
      settings
    });
  } catch (error) {
    logger.error('Error processing AugmentOS settings request:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing request' });
  }
});

// POST /augmentos-settings
// Updates the user's AugmentOS settings
router.post('/', async (req, res) => {
  logger.info('Received request to update AugmentOS settings');

  // Validate the Authorization header
  const authHeader = req.headers.authorization;
  console.log('Request headers:', req.headers);
  console.log('Authorization header:', authHeader);
  
  if (!authHeader) {
    console.log('No authorization header found');
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Extracted token:', token);
  
  if (!token) {
    console.log('No token found in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, AUGMENTOS_AUTH_JWT_SECRET) as jwt.JwtPayload;
    const userId = decoded.email;
    if (!userId) {
      return res.status(400).json({ error: 'User ID missing in token' });
    }

    // Validate request body
    const settings = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    // Find or create the user
    const user = await User.findOrCreateUser(userId);

    // Update the settings
    await user.updateAugmentosSettings(settings);

    logger.info(`Updated AugmentOS settings for user ${userId}`);

    return res.json({ 
      success: true, 
      message: 'Settings updated successfully' 
    });
  } catch (error) {
    logger.error('Error updating AugmentOS settings:', error);
    return res.status(401).json({ error: 'Invalid core token or error processing update' });
  }
});

export default router;
