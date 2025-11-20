/**
 * Template definitions for MentraOS app creation
 *
 * These templates are cloned from GitHub repositories
 */

export interface Template {
  name: string
  description: string
  repo: string
  devices?: string[]
}

export const TEMPLATES: Record<string, Template> = {
  camera: {
    name: "Camera Glasses App",
    description: "Photo capture for camera glasses (Mentra Live)",
    repo: "Mentra-Community/MentraOS-Camera-Example-App",
    devices: ["Mentra Live"],
  },
  display: {
    name: "Display Glasses App",
    description: "Live captions for display glasses",
    repo: "Mentra-Community/MentraOS-Display-Example-App",
    devices: ["Even Realities G1", "Vuzix Z100"],
  },
  extended: {
    name: "Extended Example App",
    description: "Advanced features and deployment examples",
    repo: "Mentra-Community/MentraOS-Extended-Example-App",
    devices: ["All devices"],
  },
}

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as Array<keyof typeof TEMPLATES>
