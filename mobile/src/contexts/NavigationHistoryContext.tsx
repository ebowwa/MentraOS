import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from "react"
import {useFocusEffect, usePathname, useSegments} from "expo-router"
import {router} from "expo-router"
import {BackHandler} from "react-native"

export type NavigationHistoryPush = (path: string, params?: any) => Promise<void>
export type NavigationHistoryReplace = (path: string, params?: any) => Promise<void>
export type NavigationHistoryGoBack = () => void

export type NavObject = {
  push: NavigationHistoryPush
  replace: NavigationHistoryReplace
  goBack: NavigationHistoryGoBack
  setPendingRoute: (route: string) => void
  getPendingRoute: () => string | null
  navigate: (path: string, params?: any) => void
}

interface NavigationHistoryContextType {
  goBack: () => void
  getHistory: () => string[]
  clearHistory: () => void
  push: (path: string, params?: any) => Promise<void>
  replace: (path: string, params?: any) => Promise<void>
  setPendingRoute: (route: string | null) => void
  getPendingRoute: () => string | null
  navigate: (path: string, params?: any) => void
  clearHistoryAndGoHome: () => void
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | undefined>(undefined)

export function NavigationHistoryProvider({children}: {children: React.ReactNode}) {
  const historyRef = useRef<string[]>([])
  const historyParamsRef = useRef<any[]>([])

  const pathname = usePathname()
  const segments = useSegments()
  // const [pendingRoute, setPendingRouteNonClashingName] = useState<string | null>(null)
  const pendingRoute = useRef<string | null>(null)

  useEffect(() => {
    // Add current path to history if it's different from the last entry
    const lastPath = historyRef.current[historyRef.current.length - 1]
    if (pathname !== lastPath) {
      historyRef.current.push(pathname)

      // Keep history limited to prevent memory issues (keep last 20 entries)
      if (historyRef.current.length > 20) {
        historyRef.current = historyRef.current.slice(-20)
      }
    }
  }, [pathname])

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // Skip for app settings and webview - they handle their own back navigation
        if (pathname === "/app/settings" || pathname === "/app/webview") {
          return false // Let the screen's handler execute
        }

        if (segments.length > 0 && segments[0] != "(tabs)") {
          goBack()
        }
        return true
      }

      BackHandler.addEventListener("hardwareBackPress", onBackPress)

      return () => BackHandler.removeEventListener("hardwareBackPress", onBackPress)
    }, [pathname, segments]),
  )

  const goBack = () => {
    console.log("NAV_HISTORY: goBack()")
    const history = historyRef.current

    // Remove current path
    history.pop()
    historyParamsRef.current.pop()

    // Get previous path
    const previousPath = history[history.length - 1]
    const previousParams = historyParamsRef.current[historyParamsRef.current.length - 1]

    console.log(`NAV_HISTORY: going back to: ${previousPath}`)
    // if (previousPath) {
    //   // Fallback to direct navigation if router.back() fails
    //   // router.replace({pathname: previousPath as any, params: previousParams as any})
    // } else if (router.canGoBack()) {
    //   router.back()
    // } else {
    //   // Ultimate fallback to home tab
    //   router.replace("/(tabs)/home")
    // }
    if (router.canGoBack()) {
      router.back()
    }
  }

  const push = (path: string, params?: any): Promise<void> => {
    console.log("NAV_HISTORY: push()", path)
    // if the path is the same as the last path, don't add it to the history
    if (historyRef.current[historyRef.current.length - 1] === path) {
      return Promise.resolve()
    }

    historyRef.current.push(path)
    historyParamsRef.current.push(params)

    router.push({pathname: path as any, params: params as any})
    return Promise.resolve()
  }

  const replace = (path: string, params?: any): Promise<void> => {
    console.log("NAV_HISTORY: replace()", path)
    historyRef.current.pop()
    historyParamsRef.current.pop()
    historyRef.current.push(path)
    historyParamsRef.current.push(params)
    const result = router.replace({pathname: path as any, params: params as any})
    return result || Promise.resolve()
  }

  const getHistory = () => {
    return [...historyRef.current]
  }

  const clearHistory = () => {
    console.log("NAV_HISTORY: clearHistory()")
    historyRef.current = []
    historyParamsRef.current = []
  }

  const setPendingRoute = (route: string | null) => {
    console.log("NAV_HISTORY: setPendingRoute()", route)
    // setPendingRouteNonClashingName(route)
    pendingRoute.current = route
  }

  const getPendingRoute = () => {
    return pendingRoute.current
  }

  const navigate = (path: string, params?: any) => {
    console.log("NAV_HISTORY: navigate()", path)
    router.navigate({pathname: path as any, params: params as any})
  }

  const clearHistoryAndGoHome = () => {
    console.log("NAV_HISTORY: clearHistoryAndGoHome()")
    historyRef.current = []
    historyParamsRef.current = []
    router.dismissAll()
    router.navigate("/(tabs)/home")
  }

  return (
    <NavigationHistoryContext.Provider
      value={{
        goBack,
        getHistory,
        clearHistory,
        push,
        replace,
        setPendingRoute,
        getPendingRoute,
        navigate,
        clearHistoryAndGoHome,
      }}>
      {children}
    </NavigationHistoryContext.Provider>
  )
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext)
  if (context === undefined) {
    throw new Error("useNavigationHistory must be used within a NavigationHistoryProvider")
  }
  return context
}
