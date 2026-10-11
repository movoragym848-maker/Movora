import "dotenv/config";

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev-access-secret",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  corsOrigin: process.env.CORS_ORIGIN || "*",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || "+14155238886",
  adminWhatsappNumber: process.env.ADMIN_WHATSAPP_NUMBER || "+919023987904",
  callmebotApiKey: process.env.CALLMEBOT_API_KEY,
  msg91Token: process.env.MSG91_TOKEN,
  msg91SenderId: process.env.MSG91_SENDER_ID || "MOVORA",
  whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2EndpointUrl: process.env.R2_ENDPOINT_URL,
  ffmpegPath: process.env.FFMPEG_PATH || "ffmpeg",
  reelUploadMaxBytes: Number(process.env.REEL_UPLOAD_MAX_BYTES || 150 * 1024 * 1024),
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
