// app/index.js

import {useEffect} from "react"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"
import {useAuth} from "@/contexts/AuthContext"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function IndexPage() {
  const {loading} = useAuth()
  const {initializeCoreConnection} = useCoreStatus()
  const {replace} = useNavigationHistory()

  useEffect(() => {
    const initializeApp = async () => {
      initializeCoreConnection()
      replace("/init")
    }

    if (!loading) {
      initializeApp().catch(error => {
        console.error("Error initializing app:", error)
      })
    }
  }, [loading, initializeCoreConnection])

  // this component doesn't render anything, it's just used to initialize the app
  return null
}
