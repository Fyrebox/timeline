// Mongoose models for OAuth server state, so tokens and registered clients
// survive restarts/redeploys. Short-lived records use a TTL index to auto-expire.
import mongoose from 'mongoose';

const clientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true },
    info: { type: mongoose.Schema.Types.Mixed, required: true } // OAuthClientInformationFull
  },
  { timestamps: true }
);

const accessTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  clientId: String,
  scopes: [String],
  expiresAt: { type: Date, required: true }
});
accessTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const refreshTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  clientId: String,
  scopes: [String]
});

const authCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  clientId: String,
  codeChallenge: String,
  redirectUri: String,
  scopes: [String],
  expiresAt: { type: Date, required: true }
});
authCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const pendingSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  clientId: String,
  clientName: String,
  codeChallenge: String,
  redirectUri: String,
  scopes: [String],
  state: String,
  expiresAt: { type: Date, required: true }
});
pendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthClient = mongoose.model('OAuthClient', clientSchema);
export const OAuthAccessToken = mongoose.model('OAuthAccessToken', accessTokenSchema);
export const OAuthRefreshToken = mongoose.model('OAuthRefreshToken', refreshTokenSchema);
export const OAuthAuthCode = mongoose.model('OAuthAuthCode', authCodeSchema);
export const OAuthPending = mongoose.model('OAuthPending', pendingSchema);
