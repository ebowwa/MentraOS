import { Router, Request, Response } from "express";
import {SDK_VERSIONS} from "../../../../packages/cloud/src/version"

const router = Router();

// Simple GET route
router.get("/", async (req: Request, res: Response) => {
  try {
    const response = await fetch("https://registry.npmjs.org/@mentra/sdk/latest");
    const npmSdkRes = await response.json(); // <-- actually parse the JSON

    const data = {
      success: true,
      data: {
        required: SDK_VERSIONS.required,
        latest: npmSdkRes.version
      },
      timestamp: new Date()
    };

    res.json(data); // don't forget to return the response!
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch SDK version" });
  }
});


export default router;
