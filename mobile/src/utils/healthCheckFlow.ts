import restComms from "@/managers/RestComms"
import {showAlert} from "@/utils/AlertUtils"
import {AppletInterface} from "@/types/AppletInterface"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"

interface HealthCheckFlowOptions {
  app: AppletInterface
  onStartApp: () => Promise<void>
  onAppUninstalled?: () => Promise<void>
  onHealthCheckFailed?: () => Promise<void>
  optimisticallyStopApp?: (packageName: string) => void
  clearPendingOperation?: (packageName: string) => void
}

/**
 * Performs a health check flow for an app before starting it
 * Returns true if the app should be started, false otherwise
 */
export async function performHealthCheckFlow(options: HealthCheckFlowOptions): Promise<boolean> {
  const {app, onAppUninstalled, onHealthCheckFailed, optimisticallyStopApp, clearPendingOperation} = options

  // Check if app is marked as offline by developer
  if (app.isOnline === false) {
    const shouldStart = await handleOfflineApp(app)
    if (shouldStart) {
      await options.onStartApp()
    }
    return shouldStart
  }

  // Perform initial health check
  const isHealthy = await restComms.checkAppHealthStatus(app.packageName)
  if (isHealthy) {
    await options.onStartApp()
    return true
  }

  // First attempt failed
  if (onHealthCheckFailed) {
    // Call the failure handler to revert optimistic changes
    await onHealthCheckFailed()
  }

  // Show retry dialog for all cases
  const shouldRetry = await showRetryDialog(app)
  if (!shouldRetry) {
    return false
  }

  // Retry health check
  const isHealthyOnRetry = await restComms.checkAppHealthStatus(app.packageName)
  if (isHealthyOnRetry) {
    await options.onStartApp()
    return true
  }

  // Second attempt failed - offer uninstall
  const shouldUninstall = await showUninstallDialog(app)
  if (!shouldUninstall) {
    return false
  }

  // Confirm uninstall
  const confirmedUninstall = await confirmUninstall(app)
  if (!confirmedUninstall) {
    return false
  }

  // Perform uninstall
  await uninstallApp(app, optimisticallyStopApp, clearPendingOperation, onAppUninstalled)
  return false
}

async function handleOfflineApp(app: AppletInterface): Promise<boolean> {
  return new Promise(resolve => {
    showAlert(
      `${app.name} can't be reached`,
      `This app is offline. The developer "${app.developerName || "Unknown"}" needs to bring it back online. Please contact them for details.`,
      [
        {text: "Cancel", style: "cancel", onPress: () => resolve(false)},
        {text: "Try Anyway", onPress: () => resolve(true)},
      ],
    )
  })
}

async function showRetryDialog(app: AppletInterface): Promise<boolean> {
  return new Promise(resolve => {
    showAlert(
      `${app.name} can't be reached`,
      `This app is offline. The developer "${app.developerName || "Unknown"}" needs to bring it back online. Please contact them for details.`,
      [
        {text: "Cancel", style: "cancel", onPress: () => resolve(false)},
        {text: "Try Anyway", onPress: () => resolve(true)},
      ],
    )
  })
}

async function showUninstallDialog(app: AppletInterface): Promise<boolean> {
  return new Promise(resolve => {
    showAlert(
      `${app.name} still can't be reached`,
      "The app continues to be unreachable. You may want to uninstall it and try reinstalling later.",
      [
        {text: "Uninstall", style: "destructive", onPress: () => resolve(true)},
        {text: "Okay", style: "default", onPress: () => resolve(false)},
      ],
    )
  })
}

async function confirmUninstall(app: AppletInterface): Promise<boolean> {
  return new Promise(resolve => {
    showAlert("Uninstall App", `Are you sure you want to uninstall ${app.name}?`, [
      {text: "Cancel", style: "cancel", onPress: () => resolve(false)},
      {text: "Yes, Uninstall", style: "destructive", onPress: () => resolve(true)},
    ])
  })
}

async function uninstallApp(
  app: AppletInterface,
  optimisticallyStopApp?: (packageName: string) => void,
  clearPendingOperation?: (packageName: string) => void,
  onAppUninstalled?: () => Promise<void>,
): Promise<void> {
  try {
    // Stop the app if it's running
    if (app.is_running) {
      optimisticallyStopApp?.(app.packageName)
      await restComms.stopApp(app.packageName)
      clearPendingOperation?.(app.packageName)
    }

    // Uninstall the app
    await restComms.uninstallApp(app.packageName)

    // Show success message
    GlobalEventEmitter.emit("SHOW_BANNER", {
      message: `${app.name} has been uninstalled successfully`,
      duration: 3000,
      type: "success",
    })

    // Refresh app list
    await onAppUninstalled?.()
  } catch (error) {
    console.error("Failed to uninstall app:", error)
    showAlert("Uninstall Failed", "Failed to uninstall the app. Please try again from the app settings.", [
      {text: "OK"},
    ])
  }
}
