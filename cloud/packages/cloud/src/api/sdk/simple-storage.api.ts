/**
 * Simple Storage Routes for MentraOS Cloud
 *
 * Provides key-value storage functionality for MentraOS Apps through REST API endpoints.
 * All routes are protected by SDK authentication middleware requiring valid package credentials.
 *
 * Storage is organized by userId (email) and packageName, creating isolated storage spaces
 * for each App-user combination. Data is persisted in MongoDB using the SimpleStorage model.
 *
 * Base: /api/sdk/simple-storage
 * Endpoints:
 * - GET    /:email           -> get all key/value data for a user+package
 * - PUT    /:email           -> upsert multiple key/value pairs (body: { data: Record<string,string> })
 * - DELETE /:email           -> clear all data for a user+package
 * - GET    /:email/:key      -> get single key
 * - PUT    /:email/:key      -> set single key (body: { value: string })
 * - DELETE /:email/:key      -> delete single key
 *
 * @author MentraOS Team
 */

import { Router, Request, Response } from "express";
import { authenticateSDK } from "../middleware/sdk.middleware";
import * as SimpleStorageService from "../../services/sdk/simple-storage.service";

const router = Router();

router.get("/:email", authenticateSDK, getAllHandler);
router.put("/:email", authenticateSDK, putAllHandler);
router.delete("/:email", authenticateSDK, deleteAllHandler);

router.get("/:email/:key", authenticateSDK, getKeyHandler);
router.put("/:email/:key", authenticateSDK, putKeyHandler);
router.delete("/:email/:key", authenticateSDK, deleteKeyHandler);

/**
 * `GET /api/sdk/simple-storage/:email`
 * Returns the entire key/value object for the authenticated package and the specified email.
 * `Auth: Bearer <packageName>:<apiKey>`
 */
async function getAllHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk?.packageName;

    if (!email) {
      return res.status(400).json({ error: "Missing email parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = await SimpleStorageService.getAll(email, packageName);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("GET /api/sdk/simple-storage/:email error:", error);
    return res.status(500).json({ error: "Failed to get storage" });
  }
}

/**
 * PUT /api/sdk/simple-storage/:email
 * Upserts multiple key/value pairs for the authenticated package and user.
 * Body: { data: Record<string, string> }
 * Auth: Bearer <packageName>:<apiKey>
 */
async function putAllHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk?.packageName;
    const { data } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Missing email parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({
        error: "Invalid body: expected { data: Record<string,string> }",
      });
    }

    const invalid = Object.entries(data).find(([, v]) => typeof v !== "string");
    if (invalid) {
      return res.status(400).json({
        error: "All values must be strings",
        detail: `Invalid value for key "${invalid[0]}"`,
      });
    }

    await SimpleStorageService.upsertMany(
      email,
      packageName,
      data as Record<string, string>,
    );

    return res.status(200).json({
      success: true,
      message: "Storage updated",
    });
  } catch (error) {
    console.error("PUT /api/sdk/simple-storage/:email error:", error);
    return res.status(500).json({ error: "Failed to update storage" });
  }
}

/**
 * DELETE /api/sdk/simple-storage/:email
 * Clears all key/value pairs for the authenticated package and user.
 * Auth: Bearer <packageName>:<apiKey>
 */
async function deleteAllHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdk?.packageName;

    if (!email) {
      return res.status(400).json({ error: "Missing email parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const cleared = await SimpleStorageService.clearAll(email, packageName);
    if (!cleared) {
      return res.status(404).json({
        success: false,
        message: "Storage not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Storage cleared",
    });
  } catch (error) {
    console.error("DELETE /api/sdk/simple-storage/:email error:", error);
    return res.status(500).json({ error: "Failed to clear storage" });
  }
}

/**
 * GET /api/sdk/simple-storage/:email/:key
 * Returns a single string value for the specified key.
 * Auth: Bearer <packageName>:<apiKey>
 */
async function getKeyHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const key = String(req.params.key || "");
    const packageName = req.sdk?.packageName;

    if (!email || !key) {
      return res.status(400).json({ error: "Missing email or key parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const value = await SimpleStorageService.getKey(email, packageName, key);
    if (value === undefined) {
      return res.status(404).json({
        success: false,
        message: "Key not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: { value },
    });
  } catch (error) {
    console.error("GET /api/sdk/simple-storage/:email/:key error:", error);
    return res.status(500).json({ error: "Failed to get key" });
  }
}

/**
 * PUT /api/sdk/simple-storage/:email/:key
 * Sets a single string value for the specified key.
 * Body: { value: string }
 * Auth: Bearer <packageName>:<apiKey>
 */
async function putKeyHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const key = String(req.params.key || "");
    const packageName = req.sdk?.packageName;
    const { value } = req.body || {};

    if (!email || !key) {
      return res.status(400).json({ error: "Missing email or key parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (typeof value !== "string") {
      return res
        .status(400)
        .json({ error: "Invalid body: expected { value: string }" });
    }

    await SimpleStorageService.setKey(email, packageName, key, value);
    return res.status(200).json({
      success: true,
      message: `Key "${key}" set`,
    });
  } catch (error) {
    console.error("PUT /api/sdk/simple-storage/:email/:key error:", error);
    return res.status(500).json({ error: "Failed to set key" });
  }
}

/**
 * DELETE /api/sdk/simple-storage/:email/:key
 * Deletes the specified key for the authenticated package and user.
 * Auth: Bearer <packageName>:<apiKey>
 */
async function deleteKeyHandler(req: Request, res: Response) {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const key = String(req.params.key || "");
    const packageName = req.sdk?.packageName;

    if (!email || !key) {
      return res.status(400).json({ error: "Missing email or key parameter" });
    }
    if (!packageName) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const deleted = await SimpleStorageService.deleteKey(
      email,
      packageName,
      key,
    );
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Storage not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Key "${key}" deleted`,
    });
  } catch (error) {
    console.error("DELETE /api/sdk/simple-storage/:email/:key error:", error);
    return res.status(500).json({ error: "Failed to delete key" });
  }
}

export default router;
