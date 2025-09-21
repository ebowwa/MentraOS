import type { Application } from "express";

// New API routers under src/api/*
import userSettingsApi from "./client/user-settings.api";
import feedbackApi from "./client/feedback.api";
import minVersionApi from "./client/min-version.api";
import livekitApi from "./client/livekit.api";
import sdkVersionApi from "./sdk";

// Legacy route modules (to be migrated gradually)
import appRoutes from "../routes/apps.routes";
import authRoutes from "../routes/auth.routes";
import transcriptRoutes from "../routes/transcripts.routes";
import appSettingsRoutes from "../routes/app-settings.routes";
import errorReportRoutes from "../routes/error-report.routes";
import devRoutes from "../routes/developer.routes";
import adminRoutes from "../routes/admin.routes";
import photoRoutes from "../routes/photos.routes";
import galleryRoutes from "../routes/gallery.routes";
import toolsRoutes from "../routes/tools.routes";
import hardwareRoutes from "../routes/hardware.routes";
import audioRoutes from "../routes/audio.routes";
import userDataRoutes from "../routes/user-data.routes";
import permissionsRoutes from "../routes/permissions.routes";
import accountRoutes from "../routes/account.routes";
import organizationRoutes from "../routes/organization.routes";
import onboardingRoutes from "../routes/onboarding.routes";
import appUptimeRoutes from "../routes/app-uptime.routes";
import streamsRoutes from "../routes/streams.routes";
// import rtmpRelayRoutes from "../routes/rtmp-relay.routes";

/**
 * Registers all HTTP route mounts.
 * Note: Legacy routes under src/routes are kept for now; new APIs live under src/api/*.
 */
export function registerApi(app: Application) {
  // New APIs (mounted under audience-specific prefixes)
  app.use("/api/client/user/settings", userSettingsApi);
  app.use("/api/client/feedback", feedbackApi);
  app.use("/api/client/min-version", minVersionApi);
  app.use("/api/client/livekit", livekitApi);
  app.use("/api/sdk", sdkVersionApi);

  // Legacy mounts (to be migrated)
  app.use("/api/apps", appRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/apps", appRoutes);
  app.use("/auth", authRoutes);
  app.use("/appsettings", appSettingsRoutes);
  app.use("/tpasettings", appSettingsRoutes); // TODO: Remove once old clients are updated
  app.use("/api/dev", devRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/orgs", organizationRoutes);

  app.use("/api/photos", photoRoutes);
  app.use("/api/gallery", galleryRoutes);
  app.use("/api/tools", toolsRoutes);
  app.use("/api/permissions", permissionsRoutes);
  app.use("/api/hardware", hardwareRoutes);

  // HTTP routes for augmentOS settings are now replaced by WebSocket implementation
  // app.use('/api/augmentos-settings', augmentosSettingsRoutes);
  app.use(errorReportRoutes);
  app.use(transcriptRoutes);
  app.use(audioRoutes);
  app.use("/api/user-data", userDataRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/onboarding", onboardingRoutes);
  app.use("/api/app-uptime", appUptimeRoutes);
  app.use("/api/streams", streamsRoutes);
  // app.use("/api/rtmp-relay", rtmpRelayRoutes);
}

export default registerApi;
