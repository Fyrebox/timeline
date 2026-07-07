// Web Push helpers: configure VAPID and send a notification to every stored
// subscription, pruning ones the push service reports as gone.
import webpush from 'web-push';
import { PushSubscription } from '../models/push.mjs';

let configured = false;

export function configurePush() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys not set — push notifications disabled.');
    return false;
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export function isPushConfigured() {
  return configured;
}

/**
 * Send a notification payload to every subscription.
 * @param {{title: string, body: string, url?: string}} payload
 * @returns {Promise<{sent: number, pruned: number}>}
 */
export async function sendToAll(payload) {
  if (!configured) return { sent: 0, pruned: 0 };
  const subs = await PushSubscription.find().lean();
  const data = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, data);
        sent++;
      } catch (err) {
        // 404/410 => subscription no longer valid; remove it.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint });
          pruned++;
        } else {
          console.error('[push] send failed:', err.statusCode || err.message);
        }
      }
    })
  );

  return { sent, pruned };
}

export async function sendToOne(sub, payload) {
  if (!configured) return false;
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('[push] single send failed:', err.statusCode || err.message);
    return false;
  }
}
