import React, {createContext, useContext, useEffect, useRef} from "react"
import {Linking} from "react-native"
import {useRouter} from "expo-router"
import {useAuth} from "./AuthContext"
import {initializeDeepLinkHandler, getDeepLinkHandler} from "@/utils/DeepLinkHandler"
import {deepLinkRoutes} from "@/utils/deepLinkRoutes"
import { NavObject, useNavigationHistory } from "@/contexts/NavigationHistoryContext"
import { supabase } from "@/supabase/supabaseClient"

interface DeeplinkContextType {
  handleDeepLink: (url: string, navObject: NavObject) => void
}

const DeeplinkContext = createContext<DeeplinkContextType>({
  handleDeepLink: () => {}
})

export const useDeeplink = () => useContext(DeeplinkContext)

export const DeeplinkProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const router = useRouter()
  const {user} = useAuth()
  const {push, replace, goBack} = useNavigationHistory()
  const pendingDeeplink = useRef<string | null>(null)
  const isInitialized = useRef(false)

  // Initialize the global deep link handler
  const initializeHandler = () => {
    if (isInitialized.current) return

    try {
      const handler = initializeDeepLinkHandler({
        scheme: 'com.mentra',
        host: 'apps.mentra.glass',
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
          console.warn('Fallback handler called for URL:', url)
          setTimeout(() => {
            push('/auth/login')
          }, 100)
        },
        navObject: {push, replace, goBack}
      })

      handler.initialize()
      isInitialized.current = true
    } catch (error) {
      console.error('Error initializing deep link handler:', error)
    }
  }

  const handleUrl = (url: string) => {
    try {
      if (isInitialized.current) {
        getDeepLinkHandler().handleDeepLink(url, {push, replace, goBack})
      } else {
        // Store for later if handler not ready
        pendingDeeplink.current = url
      }
    } catch (error) {
      console.error('Error handling deeplink:', error)
      push('/auth/login')
    }
  }

  useEffect(() => {
    initializeHandler()
  }, [user])

  // Handle pending deeplink after authentication
  useEffect(() => {
    if (user && pendingDeeplink.current) {
      const url = pendingDeeplink.current
      pendingDeeplink.current = null
      // Re-process the pending deeplink now that user is authenticated
      setTimeout(() => handleUrl(url), 100)
    }
  }, [user])

  const contextValue: DeeplinkContextType = {
    handleDeepLink: handleUrl
  }

  return <DeeplinkContext.Provider value={contextValue}>{children}</DeeplinkContext.Provider>
}