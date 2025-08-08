/**
 * @fileoverview AugmentOS Cloud Server entry point.
 * Initializes core services and sets up HTTP/WebSocket servers.
 */
// Load environment variables first
import dotenv from "dotenv";
import path from "path";
// Look for .env file in the project root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import express from "express";
import { Server } from "http";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

// Import services
// import { photoRequestService } from './services/core/photo-request.service';
import { DebugService } from "./services/debug/debug-service";
import { sessionService } from "./services/session/session.service";
import { websocketService } from "./services/websocket/websocket.service";
import * as AppUptimeService from "./services/core/app-uptime.service";

// Import routes
import appRoutes from "./routes/apps.routes";
import authRoutes from "./routes/auth.routes";
import transcriptRoutes from "./routes/transcripts.routes";
import appSettingsRoutes from "./routes/app-settings.routes";
import errorReportRoutes from "./routes/error-report.routes";
import devRoutes from "./routes/developer.routes";
import serverRoutes from "./routes/server.routes";
import adminRoutes from "./routes/admin.routes";
import photoRoutes from "./routes/photos.routes";
import galleryRoutes from "./routes/gallery.routes";
import toolsRoutes from "./routes/tools.routes";
import hardwareRoutes from "./routes/hardware.routes";
import audioRoutes from "./routes/audio.routes";
import userDataRoutes from "./routes/user-data.routes";
import permissionsRoutes from "./routes/permissions.routes";
import accountRoutes from "./routes/account.routes";
import organizationRoutes from "./routes/organization.routes";
import onboardingRoutes from "./routes/onboarding.routes";
// import rtmpRelayRoutes from "./routes/rtmp-relay.routes";
import appUptimeRoutes from "./routes/app-uptime.routes";
import streamsRoutes from "./routes/streams.routes";

// import appCommunicationRoutes from './routes/app-communication.routes';

// import path from "path";

// Load configuration from environment
import * as mongoConnection from "./connections/mongodb.connection";
import { logger as rootLogger } from "./services/logging/pino-logger";
const logger = rootLogger.child({ service: "index" });

// Initialize MongoDB connection
mongoConnection
  .init()
  .then(() => {
    logger.info("MongoDB connection initialized successfully");

    // Log admin emails from environment for debugging
    const adminEmails = process.env.ADMIN_EMAILS || "";
    logger.info("ENVIRONMENT VARIABLES CHECK:");
    logger.info(`- NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
    logger.info(`- ADMIN_EMAILS: "${adminEmails}"`);

    // Log additional environment details
    logger.info(`- Current working directory: ${process.cwd()}`);

    if (adminEmails) {
      const emails = adminEmails.split(",").map((e) => e.trim());
      logger.info(
        `Admin access configured for ${emails.length} email(s): [${emails.join(", ")}]`,
      );
    } else {
      logger.warn(
        "No ADMIN_EMAILS environment variable found. Admin panel will be inaccessible.",
      );

      // For development, log a helpful message
      if (process.env.NODE_ENV === "development") {
        logger.info(
          "Development mode: set ADMIN_EMAILS environment variable to enable admin access",
        );
      }
    }
  })
  .catch((error) => {
    logger.error("MongoDB connection failed:", error);
  });

// Initialize Express and HTTP server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80; // Default http port.
const app = express();
const server = new Server(app);

// Initialize services in the correct order
const debugService = new DebugService(server);
// const sessionService = initializeSessionService(debugService);

// Initialize websocket service after session service is ready
// webSocketService.initialize();

// Export services for use in other modules
export { sessionService, debugService, websocketService };

// Middleware setup
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin: [
      "*",
      "http://localhost:3000",
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:5174",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5173",
      "http://localhost:53216",
      "http://localhost:6173",
      "http://localhost:8052",
      "https://cloud.augmentos.org",
      "https://dev.augmentos.org",
      "https://devold.augmentos.org",
      "https://www.augmentos.org",
      "https://augmentos.org",
      "https://augmentos.dev",

      // AugmentOS App Store / Developer Portal
      "https://augmentos.dev",
      "https://appstore.augmentos.dev",

      "https://dev.appstore.augmentos.dev",
      "https://dev.augmentos.dev",
      "https://staging.appstore.augmentos.dev",
      "https://staging.augmentos.dev",
      "https://prod.appstore.augmentos.dev",
      "https://prod.augmentos.dev",

      "https://augmentos-developer-portal.netlify.app",

      "https://appstore.augmentos.org",
      "https://store.augmentos.org",
      "https://storedev.augmentos.org",
      "https://console.augmentos.org",
      "https://consoledev.augmentos.org",
      "https://account.augmentos.org",
      "https://accountdev.augmentos.org",
      "https://docs.mentra.glass",
      "https://docsdev.augmentos.org",

      "https://augmentos.pages.dev",
      "https://augmentos-appstore-2.pages.dev",

      "https://mentra.glass",
      "https://api.mentra.glass",
      "https://dev.api.mentra.glass",
      "https://uscentral.api.mentra.glass",
      "https://france.api.mentra.glass",
      "https://asiaeast.api.mentra.glass",

      "https://apps.mentra.glass",
      "https://console.mentra.glass",
      "https://dev.mentra.glass",
      "https://account.mentra.glass",
      "https://docs.mentra.glass",
      "https://store.mentra.glass",

      "https://appsdev.mentra.glass",
      "https://consoledev.mentra.glass",
      "https://accountdev.mentra.glass",
      "https://docsdev.mentra.glass",
      "https://storedev.mentra.glass",

      "https://dev.apps.mentra.glass",
      "https://dev.console.mentra.glass",
      "https://dev.account.mentra.glass",
      "https://dev.docs.mentra.glass",
      "https://dev.store.mentra.glass",
    ],
  }),
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Add pino-http middleware for request logging
app.use(
  pinoHttp({
    logger: rootLogger,
    genReqId: (req) => {
      // Generate correlation ID for each request
      return `${req.method}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    },
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) return "warn";
      if (res.statusCode >= 500 || err) return "error";
      return "info";
    },
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
    customErrorMessage: (req, res, err) => {
      return `${req.method} ${req.url} - ${res.statusCode} - ${err.message}`;
    },
    // Don't log health check requests to reduce noise
    autoLogging: {
      ignore: (req) => req.url === "/health",
    },
  }),
);

// Routes
app.use("/api/apps", appRoutes);
app.use("/api/auth", authRoutes);
app.use("/apps", appRoutes);
app.use("/auth", authRoutes);
app.use("/appsettings", appSettingsRoutes);
app.use("/tpasettings", appSettingsRoutes); // TODO: Remove this once the old apps are fully updated in the wild (the old mobile clients will hit the old urls)
app.use("/api/dev", devRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orgs", organizationRoutes);
// app.use('/api/app-server', appServerRoutes); // Removed as part of HeartbeatManager implementation
app.use("/api/server", serverRoutes);
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
// app.use("/api/rtmp-relay", rtmpRelayRoutes);
app.use("/api/app-uptime", appUptimeRoutes);
app.use("/api/streams", streamsRoutes);

// app.use('/api/app-communication', appCommunicationRoutes);
// app.use('/api/tpa-communication', appCommunicationRoutes); // TODO: Remove this once the old apps are fully updated in the wild (the old mobile clients will hit the old urls)

// Health check endpoint
app.get("/health", (req, res) => {
  try {
    const SessionStorage = require("./services/session/SessionStorage").default;
    const sessionStorage = SessionStorage.getInstance();
    const activeSessions = sessionStorage.getAllSessions();

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      sessions: {
        activeCount: activeSessions.length,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(500).json({
      status: "error",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
});

// Transcription monitoring endpoint for detailed stats
app.get("/api/transcription/stats", (req, res) => {
  try {
    // Import SessionStorage to get all active sessions
    const SessionStorage = require("./services/session/SessionStorage").default;
    const sessionStorage = SessionStorage.getInstance();
    const activeSessions = sessionStorage.getAllSessions();

    // Get per-session transcription stats
    const sessionStats = activeSessions.map((session: any) => {
      const metrics = session.transcriptionManager
        ? session.transcriptionManager.getMetrics()
        : {};
      return {
        sessionId: session.sessionId,
        userId: session.userId,
        isTranscribing: session.isTranscribing,
        activeStreams: metrics.activeStreams || 0,
        totalStreams: metrics.totalStreams || 0,
        byProvider: metrics.byProvider || {},
        connectedAt: session.connectedAt,
        lastActivity: session.lastActivity,
      };
    });

    // const totalStreams = sessionStats.reduce((sum, s) => sum + s.activeStreams, 0);
    // const transcribingSessions = sessionStats.filter(s => s.isTranscribing).length;

    res.json({
      timestamp: new Date().toISOString(),
      sessions: {
        totalSessions: activeSessions.length,
        // transcribingSessions,
        // totalActiveStreams: totalStreams,
        // avgStreamsPerSession: activeSessions.length > 0 ? (totalStreams / activeSessions.length).toFixed(2) : 0,
        details: sessionStats,
      },
      // providers: {
      //   // Aggregate provider usage across all sessions
      //   summary: sessionStats.reduce((acc: any, session) => {
      //     Object.entries(session.byProvider).forEach(([provider, count]) => {
      //       acc[provider] = (acc[provider] || 0) + count;
      //     });
      //     return acc;
      //   }, {})
      // }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get transcription stats",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "./public")));

// Serve uploaded photos
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Initialize WebSocket service
// Initialize WebSocket servers
websocketService.setupWebSocketServers(server);

if (process.env.UPTIME_SERVICE_RUNNING === "true") {
  AppUptimeService.startUptimeScheduler(); // start app uptime service scheduler
}

// Start the server
try {
  server.listen(PORT, () => {
    logger.info(`\n
                ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️
                😎 AugmentOS Cloud Server🚀
                🌐 Listening on port ${PORT}             🌐
                ☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️☁️ \n`);
  });
} catch (error) {
  logger.error(error, "Failed to start server:");
}

export default server;
