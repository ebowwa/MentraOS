import {getDeepLinkHandler} from "./DeepLinkHandler"

/**
 * Utility functions for working with deep links
 */

/**
 * Programmatically navigate using a deep link URL
 */
export function navigateToDeepLink(url: string): void {
  try {
    const handler = getDeepLinkHandler()
    handler.handleDeepLink(url)
  } catch (error) {
    console.error("Error navigating to deep link:", error)
  }
}

/**
 * Generate a deep link URL for the app
 */
export function generateDeepLink(path: string, params?: Record<string, string>): string {
  const scheme = "com.mentra"
  let url = `${scheme}://${path}`

  if (params && Object.keys(params).length > 0) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&")
    url += `?${queryString}`
  }

  return url
}

/**
 * Generate a universal app link URL
 */
export function generateUniversalLink(path: string, params?: Record<string, string>): string {
  const host = "apps.mentra.glass"
  let url = `https://${host}${path.startsWith("/") ? path : `/${path}`}`

  if (params && Object.keys(params).length > 0) {
    const queryString = Object.entries(params)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join("&")
    url += `?${queryString}`
  }

  return url
}

/**
 * Common deep link patterns for the app
 */
export const DeepLinks = {
  home: () => generateDeepLink("/home"),
  settings: (section?: string) => (section ? generateDeepLink(`/settings/${section}`) : generateDeepLink("/settings")),
  glasses: () => generateDeepLink("/glasses"),
  store: () => generateDeepLink("/store"),
  app: (packageName: string) => generateDeepLink(`/app/${packageName}`),
  pairing: (step?: string) => (step ? generateDeepLink(`/pairing/${step}`) : generateDeepLink("/pairing")),
  search: (query?: string) => (query ? generateDeepLink("/search", {q: query}) : generateDeepLink("/search")),
  mirrorGallery: () => generateDeepLink("/mirror/gallery"),
  mirrorVideo: (videoId: string) => generateDeepLink(`/mirror/video/${videoId}`),

  // Universal links
  universalApp: (packageName: string) => generateUniversalLink(`/apps/${packageName}`),
  universalAppSettings: (packageName: string) => generateUniversalLink(`/apps/${packageName}/settings`),
}

/**
 * Check if a URL is a valid deep link for this app
 */
export function isValidDeepLink(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.protocol === "com.mentra:" ||
      (parsedUrl.protocol === "https:" && parsedUrl.hostname === "apps.mentra.glass")
    )
  } catch {
    return false
  }
}

/**
 * Extract the path and parameters from a deep link URL
 */
export function parseDeepLink(url: string): {path: string; params: Record<string, string>} | null {
  try {
    const parsedUrl = new URL(url)
    const params: Record<string, string> = {}

    // Extract query parameters
    parsedUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })

    return {
      path: parsedUrl.pathname,
      params,
    }
  } catch {
    return null
  }
}
