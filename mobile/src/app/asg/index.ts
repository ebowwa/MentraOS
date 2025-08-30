/**
 * ASG Package - Main exports
 *
 * A comprehensive React Native package for managing ASG (Augmented Smart Glasses)
 * camera, gallery, and device functionality.
 */

// Core exports
export {GalleryScreen} from "../../components/glasses/Gallery/GalleryScreen"
export {PhotoGrid} from "../../components/glasses/Gallery/PhotoGrid"

// Services
export {AsgCameraApiClient} from "../../services/asg/asgCameraApi"

// Types
export type {PhotoInfo, GalleryResponse, ServerStatus, HealthResponse, GalleryEvent} from "../../types/asg"

// Constants
export const ASG_CONSTANTS = {
  DEFAULT_SERVER_PORT: 8089,
  DEFAULT_TIMEOUT: 10000,
  GALLERY_ENDPOINTS: ["/api/gallery", "/gallery", "/api/photos", "/photos", "/api/images", "/images"],
  PHOTO_ENDPOINTS: {
    PHOTO: "/api/photo",
    DOWNLOAD: "/api/download",
  },
  STATUS_ENDPOINTS: {
    HEALTH: "/api/health",
    STATUS: "/api/status",
  },
} as const
