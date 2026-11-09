import express from "express";
import cors from "cors";
import { config } from "./config";
import { pool } from "./db";
import { errorHandler } from "./middleware/error";

import authRouter from "./routes/auth";
import profilesRouter from "./routes/profiles";
import usersRouter from "./routes/users";
import rolesRouter from "./routes/roles";
import apiConfigurationsRouter from "./routes/apiConfigurations";
import leadsRouter from "./routes/leads";
import transactionsRouter from "./routes/transactions";
import apiKeysRouter from "./routes/apiKeys";
import systemSettingsRouter from "./routes/systemSettings";
import integrationsRouter from "./routes/integrations";
import googleSheetsRouter from "./routes/googleSheets";
import securityRouter from "./routes/security";
import { startSheetsSyncWorker, stopSheetsSyncWorker } from "./lib/googleSheets";
import { startSecurityLogPruner, stopSecurityLogPruner } from "./lib/sessions";

const app = express();

// Behind nginx (reached via loopback, or the Docker bridge when containerised):
// trust only private-network hops so req.ip is the real client from
// X-Forwarded-For and can't be spoofed by the client itself.
app.set("trust proxy", "loopback, linklocal, uniquelocal");

// CORS: allow configured origins (default '*' for dev). Comma-separated list.
const corsOrigins =
  config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim());
app.use(
  cors({
    origin: corsOrigins,
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: "2mb" }));

// API responses are per-user and carry auth headers (X-Refreshed-Token): never
// let a browser cache them. A cached /api/auth/me revalidated as 304 replays its
// stored headers, which handed the client an old token right after sign-in.
app.set("etag", false);
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Health check (no auth).
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, status: "healthy" });
  } catch {
    res.status(503).json({ ok: false, status: "db_unreachable" });
  }
});

// Mount resource routers.
app.use("/api/auth", authRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/api-configurations", apiConfigurationsRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/api-keys", apiKeysRouter);
app.use("/api/system-settings", systemSettingsRouter);
app.use("/api/google-sheets", googleSheetsRouter);
app.use("/api/security", securityRouter);
// Integration routes are mounted at /api root (proxy-request, parse-trackdrive-url).
app.use("/api", integrationsRouter);

// 404 for unmatched /api routes.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`calls-api backend listening on :${config.port} (${config.nodeEnv})`);
  startSheetsSyncWorker();
  startSecurityLogPruner();
});

// Graceful shutdown.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down...`);
  stopSheetsSyncWorker();
  stopSecurityLogPruner();
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
