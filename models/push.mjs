// Stored Web Push subscriptions (one per device/browser that opted in).
import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
