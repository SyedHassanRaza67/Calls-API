import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  port: parseInt(process.env.PORT || "8080", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // Integration secrets (optional — campaign configs usually carry their own)
  retreaverPublisherId: process.env.RETREAVER_PUBLISHER_ID || "",
  retreaverRtbKey: process.env.RETREAVER_RTB_KEY || "",
  ringbaApiToken: process.env.RINGBA_API_TOKEN || "",
  ringbaAccountId: process.env.RINGBA_ACCOUNT_ID || "",
  leadspediaApiKey: process.env.LEADSPEDIA_API_KEY || "",
  leadspediaApiSecret: process.env.LEADSPEDIA_API_SECRET || "",
  trackdrivePublicKey: process.env.TRACKDRIVE_PUBLIC_KEY || "",
  trackdrivePrivateKey: process.env.TRACKDRIVE_PRIVATE_KEY || "",
};

export type AppConfig = typeof config;
