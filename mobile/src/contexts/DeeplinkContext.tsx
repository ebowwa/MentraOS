import React, {createContext, useContext, useEffect, useRef, useState} from "react"
// import {Linking} from "react-native"
import {useRouter} from "expo-router"
import {useAuth} from "@/contexts/AuthContext"
import {deepLinkRoutes} from "@/utils/deepLinkRoutes"
import {NavObject, useNavigationHistory} from "@/contexts/NavigationHistoryContext"
import {supabase} from "@/supabase/supabaseClient"

import * as Linking from "expo-linking"

interface DeeplinkContextType {
  processUrl: (url: string) => Promise<void>
}

export interface DeepLinkRoute {
  pattern: string
  handler: (url: string, params: Record<string, string>, navObject: NavObject) => void | Promise<void>
  requiresAuth?: boolean
}

export interface DeepLinkConfig {
  scheme: string
  host?: string
  routes: DeepLinkRoute[]
  fallbackHandler: (url: string) => void
  authCheckHandler: () => Promise<boolean>
  navObject: NavObject
}

const DeeplinkContext = createContext<DeeplinkContextType>({})

export const useDeeplink = () => useContext(DeeplinkContext)

export const DeeplinkProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const router = useRouter()
  const {user} = useAuth()
  const {push, replace, goBack, setPendingRoute, getPendingRoute} = useNavigationHistory()
  const config = {
    scheme: "com.mentra",
    host: "apps.mentra.glass",
    routes: deepLinkRoutes,
    authCheckHandler: async () => {
      // TODO: this is a hack when we should really be using the auth context:
      const session = await supabase.auth.getSession()
      if (session.data.session == null) {
        return false
      }
      return true
    },
    fallbackHandler: (url: string) => {
      console.warn("Fallback handler called for URL:", url)
      setTimeout(() => {
        push("/auth/login")
      }, 100)
    },
    navObject: {push, replace, goBack, setPendingRoute, getPendingRoute},
  }

  const handleUrlRaw = async ({url}: {url: string}) => {
    processUrl(url, false)
  }

  useEffect(() => {
    const subscription = Linking.addEventListener("url", handleUrlRaw)
    Linking.getInitialURL().then(url => {
      console.log("@@@@@@@@@@@@@ INITIAL URL @@@@@@@@@@@@@@@", url)
      if (url) {
        processUrl(url, true)
      }
    })
  }, [])

  /**
   * Find matching route for the given URL
   */
  const findMatchingRoute = (url: URL): DeepLinkRoute | null => {
    let pathname = url.pathname
    const host = url.host
    if (host === "auth") {
      pathname = `/auth${pathname}`
    }

    for (const route of config.routes) {
      if (matchesPattern(pathname, route.pattern)) {
        return route
      }
    }

    return null
  }

  /**
   * Check if pathname matches the route pattern
   */
  const matchesPattern = (pathname: string, pattern: string): boolean => {
    // Convert pattern to regex
    // /user/:id -> /user/([^/]+)
    const regexPattern = pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\*/g, ".*")

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(pathname)
  }

  const extractParams = (url: URL, pattern: string): Record<string, string> => {
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

  const processUrl = async (url: string, initial: boolean = false) => {
    try {
      // Add delay to ensure Root Layout is mounted
      if (initial) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      console.log("[LOGIN DEBUG] Deep link received:", url)

      // small hack since some sources strip the host and we want to put the url into URL object here
      if (url.startsWith("/")) {
        url = "https://apps.mentra.glass" + url
      }
      console.log("@@@@@@@@@@@@@ URL @@@@@@@@@@@@@@@", url)

      const parsedUrl = new URL(url)
      const matchedRoute = findMatchingRoute(parsedUrl)

      if (!matchedRoute) {
        console.warn("No matching route found for URL:", url)
        config.fallbackHandler?.(url)
        return
      }

      const authed = await config.authCheckHandler()

      // Check authentication if required
      if (matchedRoute.requiresAuth && !authed) {
        console.warn("Authentication required for route:", matchedRoute.pattern)
        // Store the URL for after authentication
        setPendingRoute(url)
        setTimeout(() => {
          try {
            replace("/auth/login")
          } catch (error) {
            console.warn("Navigation failed, router may not be ready:", error)
          }
        }, 100)
      }

      // Extract parameters from URL
      const params = extractParams(parsedUrl, matchedRoute.pattern)
      if (authed) {
        params.authed = "true"
      }
      if (!initial) {
        params.preloaded = "true"
      }

      try {
        matchedRoute.handler(url, params, {push, replace, goBack, setPendingRoute, getPendingRoute})
      } catch (error) {
        console.warn("Route handler failed, router may not be ready:", error)
      }
    } catch (error) {
      console.error("Error handling deep link:", error)
      config.fallbackHandler?.(url)
    }
  }

  const contextValue: DeeplinkContextType = {
    processUrl,
  }

  return <DeeplinkContext.Provider value={contextValue}>{children}</DeeplinkContext.Provider>
}
