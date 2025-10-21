import {useEffect} from "react"
import {useAuth} from "@/contexts/AuthContext"
import {useNavigationHistory} from "@/contexts/NavigationHistoryContext"

export default function IndexPage() {
  const {loading} = useAuth()
  const {replace} = useNavigationHistory()

  useEffect(() => {
    const initializeApp = async () => {
      replace("/init")
    }

    if (!loading) {
      initializeApp().catch(error => {
        console.error("Error initializing app:", error)
      })
    }
  }, [loading])

  // this component doesn't render anything, it's just used to initialize the app
  return null
}
