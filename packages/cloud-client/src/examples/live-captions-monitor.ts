#!/usr/bin/env ts-node
/**
 * Live Captions Continuous Monitor
 *
 * Runs the live captions test in a continuous loop and exposes a /health endpoint
 * that reports current status and time since the last issue.
 */

import express, { Request, Response } from "express";
import { runLiveCaptionsTestOnce } from "./live-captions-test";

const DEFAULT_LISTEN_SECONDS = Number(
  process.env.LIVE_CAPTIONS_LISTEN_SECONDS || 60,
);
const SLEEP_BETWEEN_RUNS_MS = Number(
  process.env.LIVE_CAPTIONS_SLEEP_MS || 2000,
);
const PORT = Number(process.env.PORT || process.env.HEALTH_PORT || 3000);

type Status = "healthy" | "issue";

const app = express();

const serviceStartAt = new Date();
let lastIssueAt: Date | null = null;
let lastSuccessAt: Date | null = null;
let totalRuns = 0;
let consecutiveFailures = 0;
let lastResult: boolean | null = null;
let didHearAlphabet = {};
let lastFailures: string | null = null;

function msToHuman(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const s = sec % 60;
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600) % 24;
  const d = Math.floor(sec / 86400);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function getStatus(): Status {
  return consecutiveFailures > 0 ? "issue" : "healthy";
}

app.get("/health", (_req: Request, res: Response) => {
  const now = new Date();
  const sinceLastIssueMs =
    now.getTime() -
    (lastIssueAt ? lastIssueAt.getTime() : serviceStartAt.getTime());
  const uptimeMs = now.getTime() - serviceStartAt.getTime();
  const status = getStatus();
  const heardThisRun = Object.keys(didHearAlphabet);

  const payload = {
    status,
    sinceLastIssueMs,
    sinceLastIssueHuman: msToHuman(sinceLastIssueMs),
    uptimeMs,
    uptimeHuman: msToHuman(uptimeMs),
    lastIssueAt: lastIssueAt ? lastIssueAt.toISOString() : null,
    lastSuccessAt: lastSuccessAt ? lastSuccessAt.toISOString() : null,
    totalRuns,
    consecutiveFailures,
    lastResult,
    heardThisRun,
    lastFailures,
  };

  res.status(status === "healthy" ? 200 : 503).json(payload);
});

const server = app.listen(PORT, () => {
  console.log(`🩺 Health server listening on http://localhost:${PORT}/health`);
});

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(): Promise<void> {
  while (true) {
    didHearAlphabet = {};
    const ok = await runLiveCaptionsTestOnce(
      DEFAULT_LISTEN_SECONDS,
      (letter) => {
        (didHearAlphabet as any)[letter] = true;
      },
      (failures) => {
        console.error(failures);
        lastFailures = failures;
        lastIssueAt = new Date();
      },
    );
    totalRuns += 1;
    lastResult = ok;
    if (ok) {
      consecutiveFailures = 0;
      lastSuccessAt = new Date();
    } else {
      consecutiveFailures += 1;
    }
    await sleep(SLEEP_BETWEEN_RUNS_MS);
  }
}

loop().catch((err) => {
  console.error("Fatal error in monitor loop:", err);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  server.close(() => process.exit(0));
});
