import {Linking} from "react-native"
import {router} from "expo-router"
import {URL} from "react-native-url-polyfill"
import {NavigationHistoryPush, NavigationHistoryReplace, NavObject} from "@/contexts/NavigationHistoryContext"

export interface DeepLinkRoute {
  pattern: string
  handler: (
    url: string,
    params: Record<string, string>,
    navObject: NavObject,
  ) => void | Promise<void>
  requiresAuth?: boolean
}

export interface DeepLinkConfig {
  scheme: string
  host?: string
  routes: DeepLinkRoute[]
  fallbackHandler?: (url: string) => void
  authCheckHandler: () => Promise<boolean>
  navObject: NavObject
}

export class DeepLinkHandler {
  private config: DeepLinkConfig
  private isInitialized = false

  constructor(config: DeepLinkConfig) {
    this.config = config
  }

  /**
   * Initialize the deep link handler
   * Call this in your app's root component
   */
  initialize(): (() => void) | undefined {
    if (this.isInitialized) {
      return
    }

    // Handle URLs when app is already running
    const subscription = Linking.addEventListener("url", this.handleUrlRaw)

    this.isInitialized = true

    // Return cleanup function
    return () => {
      subscription?.remove()
      this.isInitialized = false
    }
  }

  private handleUrlRaw = ({url}: {url: string}): void => {
    this.handleUrl(url, this.config.navObject)
  }

  /**
   * Handle incoming URLs
   */
  private handleUrl = async (url: string, navObject: NavObject) => {
    try {
      console.log("[LOGIN DEBUG] Deep link received:", url)

      // if (!this.isValidUrl(url)) {
      //   console.warn('Invalid deep link URL:', url)
      //   this.config.fallbackHandler?.(url)
      //   return
      // }

      const parsedUrl = new URL(url)
      const matchedRoute = this.findMatchingRoute(parsedUrl)

      if (!matchedRoute) {
        console.warn("No matching route found for URL:", url)
        this.config.fallbackHandler?.(url)
        return
      }

      // Check authentication if required
      if (matchedRoute.requiresAuth && !(await this.config.authCheckHandler())) {
        console.warn("Authentication required for route:", matchedRoute.pattern)
        // Store the URL for after authentication
        // this.storeUrlForLater(url)
        console.log("[LOGIN DEBUG] NAVIGATE TO LOGIN")
        setTimeout(() => {
          navObject.replace("/auth/login")
        }, 100)
        return
      }

      // Extract parameters from URL
      const params = this.extractParams(parsedUrl, matchedRoute.pattern)

      // Execute the route handler
      matchedRoute.handler(url, params, navObject)
    } catch (error) {
      console.error("Error handling deep link:", error)
      this.config.fallbackHandler?.(url)
    }
  }

  /**
   * Check if URL is valid for this app
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)

      // Check scheme
      if (parsedUrl.protocol.replace(":", "") !== this.config.scheme) {
        return false
      }

      // Check host if specified
      if (this.config.host && parsedUrl.hostname !== this.config.host) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * Find matching route for the given URL
   */
  private findMatchingRoute(url: URL): DeepLinkRoute | null {
    let pathname = url.pathname
    let host = url.host
    if (host === "auth") {
      pathname = `/auth${pathname}`
    }

    console.log("pathname", pathname)

    for (const route of this.config.routes) {
      if (this.matchesPattern(pathname, route.pattern)) {
        return route
      }
    }

    return null
  }

  /**
   * Check if pathname matches the route pattern
   */
  private matchesPattern(pathname: string, pattern: string): boolean {
    // Convert pattern to regex
    // /user/:id -> /user/([^/]+)
    const regexPattern = pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\*/g, ".*")

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(pathname)
  }

  /**
   * Extract parameters from URL based on pattern
   */
  private extractParams(url: URL, pattern: string): Record<string, string> {
    const params: Record<string, string> = {}

    // Extract path parameters
    const pathParts = url.pathname.split("/").filter(Boolean)
    const patternParts = pattern.split("/").filter(Boolean)

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i]
      const pathPart = pathParts[i]

      if (patternPart.startsWith(":")) {
        const paramName = patternPart.slice(1)
        params[paramName] = pathPart || ""
      }
    }

    // Extract query parameters
    url.searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  }

  /**
   * Store URL for later processing after authentication
   */
  private storeUrlForLater(url: string): void {
    // Store in async storage or similar
    console.log("Storing URL for later:", url)
    // Implementation depends on your storage solution
  }

  /**
   * Programmatically handle a deep link
   */
  handleDeepLink(url: string, navObject: NavObject): void {
    this.handleUrl(url, navObject)
  }

  /**
   * Register a new route dynamically
   */
  registerRoute(route: DeepLinkRoute): void {
    this.config.routes.push(route)
  }

  /**
   * Remove a route
   */
  removeRoute(pattern: string): void {
    this.config.routes = this.config.routes.filter(route => route.pattern !== pattern)
  }

  /**
   * Get all registered routes
   */
  getRoutes(): DeepLinkRoute[] {
    return [...this.config.routes]
  }
}

// Singleton instance
let deepLinkHandlerInstance: DeepLinkHandler | null = null

/**
 * Get the global deep link handler instance
 */
export function getDeepLinkHandler(): DeepLinkHandler {
  if (!deepLinkHandlerInstance) {
    throw new Error("DeepLinkHandler not initialized. Call initializeDeepLinkHandler first.")
  }
  return deepLinkHandlerInstance
}

/**
 * Initialize the global deep link handler
 */
export function initializeDeepLinkHandler(config: DeepLinkConfig): DeepLinkHandler {
  if (deepLinkHandlerInstance) {
    console.warn("DeepLinkHandler already initialized")
    return deepLinkHandlerInstance
  }

  deepLinkHandlerInstance = new DeepLinkHandler(config)
  return deepLinkHandlerInstance
}

/**
 * Destroy the global deep link handler
 */
export function destroyDeepLinkHandler(): void {
  deepLinkHandlerInstance = null
}
