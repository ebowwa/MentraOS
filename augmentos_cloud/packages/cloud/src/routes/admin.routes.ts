// routes/admin.routes.ts
import { Router, Request, Response } from 'express';
import { validateAdminEmail } from '../middleware/admin-auth.middleware';
import App from '../models/app.model';
import { logger } from '@augmentos/utils';

const router = Router();

/**
 * Get admin dashboard stats - simplified version
 */
const getAdminStats = async (req: Request, res: Response) => {
  try {
    // Count apps by status
    const [
      developmentCount,
      submittedCount,
      publishedCount,
      rejectedCount
    ] = await Promise.all([
      App.countDocuments({ appStoreStatus: 'DEVELOPMENT' }),
      App.countDocuments({ appStoreStatus: 'SUBMITTED' }),
      App.countDocuments({ appStoreStatus: 'PUBLISHED' }),
      App.countDocuments({ appStoreStatus: 'REJECTED' })
    ]);
    
    // Get recently submitted apps
    const recentSubmissions = await App.find({ appStoreStatus: 'SUBMITTED' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();
    
    const finalStats = {
      counts: {
        development: developmentCount,
        submitted: submittedCount,
        published: publishedCount,
        rejected: rejectedCount,
        admins: 0 // Placeholder since we're not tracking admins in DB anymore
      },
      recentSubmissions
    };
    
    res.json(finalStats);
  } catch (error) {
    logger.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};

// Admin check route - just verifies that the user's email is in the admin list
router.get('/check', validateAdminEmail, (req, res) => {
  res.json({ 
    isAdmin: true, 
    role: 'ADMIN', // Simplified - all admins have the same role now
    email: req.body.userEmail
  });
});

// Public debug route to check database status - no auth required
router.get('/debug', async (req, res) => {
  try {
    // Count apps by status
    const counts = {
      apps: {
        total: await App.countDocuments(),
        development: await App.countDocuments({ appStoreStatus: 'DEVELOPMENT' }),
        submitted: await App.countDocuments({ appStoreStatus: 'SUBMITTED' }),
        published: await App.countDocuments({ appStoreStatus: 'PUBLISHED' }),
        rejected: await App.countDocuments({ appStoreStatus: 'REJECTED' })
      }
    };
    
    // Return JSON with CORS headers to ensure browser can receive it
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.json({
      status: 'Database connection working',
      time: new Date().toISOString(),
      counts
    });
  } catch (error) {
    logger.error('Error in debug route:', error);
    res.status(500).json({ 
      error: 'Error connecting to database', 
      message: error.message 
    });
  }
});

// App review routes - only implementing stats for now
router.get('/apps/stats', validateAdminEmail, getAdminStats);

export default router;