import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import settings, {SETTINGS_KEYS} from "@/managers/Settings"
import {AppletInterface} from "@/contexts/AppletStatusProvider"

interface Callback {
  onSuccess: (data: any) => void
  onFailure: (errorCode: number) => void
}

interface ApiResponse<T = any> {
  success?: boolean
  data?: T
  error?: string
  token?: string
  [key: string]: any
}

interface RequestConfig {
  method: "GET" | "POST" | "DELETE"
  url: string
  headers?: Record<string, string>
  data?: any
  params?: any
}

class RestComms {
  private static instance: RestComms
  private readonly TAG = "RestComms"
  private coreToken: string | null = null

  private constructor() {}

  public static getInstance(): RestComms {
    if (!RestComms.instance) {
      RestComms.instance = new RestComms()
    }
    return RestComms.instance
  }

  // Token Management
  public setCoreToken(token: string | null): void {
    this.coreToken = token
    console.log(
      `${this.TAG}: Core token ${token ? "set" : "cleared"} - Length: ${
        token?.length || 0
      } - First 20 chars: ${token?.substring(0, 20) || "null"}`,
    )

    if (token) {
      console.log(`${this.TAG}: Core token set, emitting CORE_TOKEN_SET event`)
      GlobalEventEmitter.emit("CORE_TOKEN_SET")
    }
  }

  public getCoreToken(): string | null {
    return this.coreToken
  }

  // Helper Methods
  private validateToken(): void {
    if (!this.coreToken) {
      throw new Error("No core token available for authentication")
    }
  }

  private createAuthHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.coreToken}`,
    }
  }

  private buildUrlWithParams(url: string, params?: any): string {
    if (!params) return url

    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join("&")

    return `${url}?${queryString}`
  }

  private async makeRequest<T = any>(config: RequestConfig): Promise<T> {
    const {method, url, headers, data, params} = config
    let status = 0
    try {
      const fullUrl = this.buildUrlWithParams(url, params)

      const fetchConfig: RequestInit = {
        method,
        headers: headers || {},
      }

      // Add body for POST and DELETE requests if data exists
      if ((method === "POST" || method === "DELETE") && data) {
        fetchConfig.body = JSON.stringify(data)
      }

      const response = await fetch(fullUrl, fetchConfig)
      status = response.status

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = `Bad response: ${response.statusText}`
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch {
          // If we can't parse the error response, use the default message
        }
        throw new Error(errorMessage)
      }

      // Parse JSON response
      const responseData = await response.json()
      return responseData as T
    } catch (error: any) {
      const errorMessage = error.message || error
      console.error(`${this.TAG}: ${method} to ${url} failed with status ${status}`, errorMessage)
      throw error
    }
  }

  private async authenticatedRequest<T = any>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    data?: any,
    params?: any,
  ): Promise<T> {
    this.validateToken()

    const baseUrl = await settings.getRestUrl()
    const url = `${baseUrl}${endpoint}`

    console.log(`${method} request to: ${url}`)

    const config: RequestConfig = {
      method,
      url,
      headers: this.createAuthHeaders(),
      data,
      params,
    }

    return this.makeRequest<T>(config)
  }

  private async request<T = any>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    data?: any,
    params?: any,
  ): Promise<T> {
    const baseUrl = await settings.getRestUrl()
    const url = `${baseUrl}${endpoint}`
    const config: RequestConfig = {
      method,
      url,
      headers: this.createAuthHeaders(),
      data,
      params,
    }
    return this.makeRequest<T>(config)
  }

  // Public API Methods

  public async getMinimumClientVersion(): Promise<ApiResponse<{required: string; recommended: string}>> {
    const response = await this.request("GET", "/api/client/min-version")
    return response.data
  }

  public async checkAppHealthStatus(packageName: string): Promise<boolean> {
    // GET the app's /health endpoint
    try {
      const baseUrl = await settings.getRestUrl()
      // POST /api/app-uptime/app-pkg-health-check with body { "packageName": packageName }
      const healthUrl = `${baseUrl}/api/app-uptime/app-pkg-health-check`
      const healthResponse = await fetch(healthUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({packageName}),
      })
      const healthData = await healthResponse.json()
      return healthData.success
    } catch (error) {
      console.error("AppStatusProvider: Error checking app health status:", error)
      return false
    }
  }

  // App Management
  public async getApps(): Promise<AppletInterface[]> {
    console.log(`${this.TAG}: getApps() called`)

    const response = await this.authenticatedRequest<ApiResponse<AppletInterface[]>>("GET", "/api/apps/")

    if (!response.success || !response.data) {
      throw new Error("Invalid response format")
    }

    return response.data
  }

  public async startApp(packageName: string): Promise<any> {
    try {
      const response = await this.authenticatedRequest("POST", `/apps/${packageName}/start`)
      console.log("App started successfully:", packageName)
      return response
    } catch (error: any) {
      GlobalEventEmitter.emit("SHOW_BANNER", {
        message: `Could not connect to ${packageName}`,
        type: "error",
      })
      throw error
    }
  }

  public async stopApp(packageName: string): Promise<any> {
    const response = await this.authenticatedRequest("POST", `/apps/${packageName}/stop`)
    console.log("App stopped successfully:", packageName)
    return response
  }

  public async uninstallApp(packageName: string): Promise<any> {
    const response = await this.authenticatedRequest("POST", `/api/apps/uninstall/${packageName}`)
    console.log("App uninstalled successfully:", packageName)
    return response
  }

  // App Settings
  public async getAppSettings(appName: string): Promise<any> {
    return this.authenticatedRequest("GET", `/appsettings/${appName}`)
  }

  public async updateAppSetting(appName: string, update: {key: string; value: any}): Promise<any> {
    return this.authenticatedRequest("POST", `/appsettings/${appName}`, update)
  }

  public async exchangeToken(supabaseToken: string): Promise<string> {
    const baseUrl = await settings.getRestUrl()
    const url = `${baseUrl}/auth/exchange-token`

    const config: RequestConfig = {
      method: "POST",
      url,
      headers: {"Content-Type": "application/json"},
      data: {supabaseToken},
    }

    const response = await this.makeRequest<ApiResponse>(config)

    if (!response.coreToken) {
      throw new Error("No core token in response")
    }

    this.setCoreToken(response.coreToken)
    return response.coreToken
  }

  public async generateWebviewToken(packageName: string, endpoint: string = "generate-webview-token"): Promise<string> {
    const response = await this.authenticatedRequest<ApiResponse>("POST", `/api/auth/${endpoint}`, {packageName})

    if (!response.success || !response.token) {
      throw new Error(`Failed to generate webview token: ${response.error || "Unknown error"}`)
    }

    console.log(`Received temporary webview token for ${packageName}`)
    return response.token
  }

  public async hashWithApiKey(stringToHash: string, packageName: string): Promise<string> {
    const response = await this.authenticatedRequest<ApiResponse>("POST", "/api/auth/hash-with-api-key", {
      stringToHash,
      packageName,
    })

    if (!response.success || !response.hash) {
      throw new Error(`Failed to generate hash: ${response.error || "Unknown error"}`)
    }

    return response.hash
  }

  // Account Management
  public async requestAccountDeletion(): Promise<any> {
    return this.authenticatedRequest("POST", "/api/account/request-deletion")
  }

  public async confirmAccountDeletion(requestId: string, confirmationCode: string): Promise<any> {
    return this.authenticatedRequest("DELETE", "/api/account/confirm-deletion", {requestId, confirmationCode})
  }

  public async getLivekitUrlAndToken(): Promise<{url: string; token: string}> {
    const response = await this.authenticatedRequest("GET", "/api/client/livekit/token")
    const {url, token} = response.data
    return {url, token}
  }

  // Data Export
  public async requestDataExport(): Promise<any> {
    return this.authenticatedRequest("POST", "/api/account/request-export", {format: "json"})
  }

  public async getExportStatus(exportId: string): Promise<any> {
    return this.authenticatedRequest("GET", "/api/account/export-status", null, {id: exportId})
  }

  public async downloadExport(exportId: string): Promise<any> {
    return this.authenticatedRequest("GET", `/api/account/download-export/${exportId}`)
  }

  // User Feedback & Settings
  public async sendFeedback(feedbackBody: string): Promise<void> {
    await this.authenticatedRequest("POST", "/api/client/feedback", {feedback: feedbackBody})
  }

  public async writeUserSettings(settings: any): Promise<void> {
    await this.authenticatedRequest("POST", "/api/client/user/settings", {settings})
  }

  public async loadUserSettings(): Promise<any> {
    return await this.authenticatedRequest("GET", "/api/client/user/settings")
  }

  // Error Reporting
  public async sendErrorReport(reportData: any): Promise<any> {
    return this.authenticatedRequest("POST", "/app/error-report", reportData)
  }

  // Calendar
  // { events: any[], calendars: any[] }
  public async sendCalendarData(data: any): Promise<any> {
    return this.authenticatedRequest("POST", "/api/client/calendar", data)
  }

  // Location
  public async sendLocationData(data: any): Promise<any> {
    return this.authenticatedRequest("POST", "/api/client/location", data)
  }
}

const restComms = RestComms.getInstance()
export default restComms
