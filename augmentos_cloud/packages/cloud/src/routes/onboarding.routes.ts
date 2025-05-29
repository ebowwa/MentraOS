import express from 'express';
import { User } from '../models/user.model';
import App from '../models/app.model';

const router = express.Router();

// GET /onboarding/status?email=...&packageName=...
router.get('/status', async (req, res) => {
  const email = req.query.email as string;
  const packageName = req.query.packageName as string;
  if (!email || !packageName) return res.status(400).json({ error: 'Missing email or packageName' });
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    let hasCompleted = false;
    if (user && user.onboardingStatus) {
      const status = user.onboardingStatus;
      if (status instanceof Map) {
        hasCompleted = !!status.get(packageName);
      } else if (typeof status === 'object' && status !== null) {
        hasCompleted = !!status[packageName];
      }
    }
    res.json({ hasCompletedOnboarding: hasCompleted });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /onboarding/complete { email, packageName }
router.post('/complete', async (req, res) => {
  const email = req.body.email as string;
  const packageName = req.body.packageName as string;
  if (!email || !packageName) return res.status(400).json({ error: 'Missing email or packageName' });
  try {
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { [`onboardingStatus.${packageName}`]: true } },
      { new: true, upsert: true }
    );
    let hasCompleted = false;
    if (user && user.onboardingStatus) {
      const status = user.onboardingStatus;
      if (status instanceof Map) {
        hasCompleted = !!status.get(packageName);
      } else if (typeof status === 'object' && status !== null) {
        hasCompleted = !!status[packageName];
      }
    }
    res.json({ success: true, hasCompletedOnboarding: hasCompleted });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /instructions?packageName=...
router.get('/instructions', async (req, res) => {
  const packageName = req.query.packageName as string;
  if (!packageName) return res.status(400).json({ error: 'Missing packageName' });

  try {
    const app = await App.findOne({ packageName });
    if (!app || !app.onboardingInstructions) {
      return res.status(404).json({ error: 'No onboarding instructions found for this package' });
    }
    res.json({ instructions: app.onboardingInstructions });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;