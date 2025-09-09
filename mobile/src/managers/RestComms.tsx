import axios, {AxiosRequestConfig, AxiosResponse} from "axios"
import GlobalEventEmitter from "@/utils/GlobalEventEmitter"
import {getRestUrl} from "@/utils/SettingsHelper"
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

  private async makeRequest<T = any>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await axios(config)

      if (response.status !== 200) {
        throw new Error(`Bad response: ${response.statusText}`)
      }

      return response.data
    } catch (error: any) {
      const errorMessage = error.message || error
      console.error(`${this.TAG}: Request failed -`, errorMessage)

      if (axios.isAxiosError(error) && error.response?.data?.error) {
        throw new Error(error.response.data.error)
      }

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

    const baseUrl = await getRestUrl()
    const url = `${baseUrl}${endpoint}`

    console.log(`${method} request to: ${url}`)

    const config: AxiosRequestConfig = {
      method,
      url,
      headers: this.createAuthHeaders(),
      ...(data && {data}),
      ...(params && {params}),
    }

    return this.makeRequest<T>(config)
  }

  private async request<T = any>(
    method: "GET" | "POST" | "DELETE",
    endpoint: string,
    data?: any,
    params?: any,
  ): Promise<T> {
    const baseUrl = await getRestUrl()
    const url = `${baseUrl}${endpoint}`
    const config: AxiosRequestConfig = {
      method,
      url,
      headers: this.createAuthHeaders(),
      ...(data && {data}),
      ...(params && {params}),
    }
    return this.makeRequest<T>(config)
  }

  // Public API Methods

  public async getMinimumClientVersion(): Promise<ApiResponse<{required: string; recommended: string}>> {
    const response = await this.request("GET", "/api/client/min-version")
    return response.data
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

  // Authentication
  public async exchangeToken(supabaseToken: string): Promise<string> {
    const baseUrl = await getRestUrl()
    const url = `${baseUrl}/auth/exchange-token`

    const config: AxiosRequestConfig = {
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
}

const restComms = RestComms.getInstance()
export default restComms
