// Endpoints for the browser to manage its push subscription.
import { Router } from 'express';
import { PushSubscription } from '../models/push.mjs';
import { sendToOne, sendToAll, isPushConfigured } from '../lib/push.mjs';
import { runDailyDigest } from '../lib/notify.mjs';

const router = Router();

// The VAPID public key the client needs to subscribe.
router.get('/public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
});

// Store (or refresh) a subscription, then send a confirmation notification.
router.post('/subscribe', async (req, res, next) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint || !sub.keys) {
      return res.status(400).json({ error: 'Invalid subscription.' });
    }
    await PushSubscription.updateOne(
      { endpoint: sub.endpoint },
      { $set: { endpoint: sub.endpoint, keys: sub.keys } },
      { upsert: true }
    );
    await sendToOne(sub, {
      title: 'Notifications on',
      body: "You'll get a 7am summary of each day's events.",
      url: '/'
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) await PushSubscription.deleteOne({ endpoint });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Send an immediate test notification to all subscriptions (for verifying).
router.post('/test', async (req, res, next) => {
  try {
    const result = await sendToAll({ title: 'Test notification', body: 'Timeline push is working ✅', url: '/' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Manually trigger the daily digest now (for testing the 7am job).
router.post('/run-digest', async (req, res, next) => {
  try {
    res.json(await runDailyDigest());
  } catch (err) {
    next(err);
  }
});

export default router;
