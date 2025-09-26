/**
 * Simple Storage Routes for MentraOS Cloud
 *
 * Provides key-value storage functionality for MentraOS Apps through REST API endpoints.
 * All routes are protected by SDK authentication middleware requiring valid package credentials.
 *
 * Storage is organized by userId (email) and packageName, creating isolated storage spaces
 * for each App-user combination. Data is persisted in MongoDB using the SimpleStorage model.
 *
 * @author MentraOS Team
 */

/**../../models/simple-storage.model
 * Base: /api/sdk/simple-storage
 * Endpoints:../../middleware/sdk.middleware
 * - GET    /:email           -> get all key/value data for a user+package
 * - PUT    /:email           -> upsert multiple key/value pairs (body: { data: Record<string,string> })
 * - DELETE /:email           -> clear all data for a user+package
 * - GET    /:email/:key      -> get single key
 * - PUT    /:email/:key      -> set single key (body: { value: string })
 * - DELETE /:email/:key      -> delete single key
 */

import { Router, Request, Response } from "express";
import { authenticateSDK } from "../middleware/sdk.middleware";
import * as SimpleStorageService from "../../services/sdk/simple-storage.service";

const router = Router();

/**
 * GET /:email
 * Returns the entire key/value object for the authenticated package and the specified email.
 */
router.get("/:email", authenticateSDK, async (req: Request, res: Response) => {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdkAuth?.packageName;

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
});

/**
 * PUT /:email
 * Upsert multiple key/value pairs. Body must be: { data: Record<string,string> }
 */
router.put("/:email", authenticateSDK, async (req: Request, res: Response) => {
  try {
    const email = String(req.params.email || "").toLowerCase();
    const packageName = req.sdkAuth?.packageName;
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

    // Validate all values are strings
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
});

/**
 * DELETE /:email
 * Clears all key/value pairs for the given user+package.
 */
router.delete(
  "/:email",
  authenticateSDK,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.params.email || "").toLowerCase();
      const packageName = req.sdkAuth?.packageName;

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
  },
);

/**
 * GET /:email/:key
 * Returns a single value for the given key.
 */
router.get(
  "/:email/:key",
  authenticateSDK,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.params.email || "").toLowerCase();
      const key = String(req.params.key || "");
      const packageName = req.sdkAuth?.packageName;

      if (!email || !key) {
        return res
          .status(400)
          .json({ error: "Missing email or key parameter" });
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
  },
);

/**
 * PUT /:email/:key
 * Sets a single key to a string value. Body: { value: string }
 */
router.put(
  "/:email/:key",
  authenticateSDK,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.params.email || "").toLowerCase();
      const key = String(req.params.key || "");
      const packageName = req.sdkAuth?.packageName;
      const { value } = req.body || {};

      if (!email || !key) {
        return res
          .status(400)
          .json({ error: "Missing email or key parameter" });
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
  },
);

/**
 * DELETE /:email/:key
 * Deletes a single key for the given user+package.
 */
router.delete(
  "/:email/:key",
  authenticateSDK,
  async (req: Request, res: Response) => {
    try {
      const email = String(req.params.email || "").toLowerCase();
      const key = String(req.params.key || "");
      const packageName = req.sdkAuth?.packageName;

      if (!email || !key) {
        return res
          .status(400)
          .json({ error: "Missing email or key parameter" });
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
  },
);

export default router;
