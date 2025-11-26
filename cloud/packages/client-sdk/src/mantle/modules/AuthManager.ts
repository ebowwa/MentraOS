import { IPlatform } from "../../interfaces/IPlatform";

export class AuthManager {
    private readonly TOKEN_KEY = "mentra_core_token";

    constructor(private platform: IPlatform) { }

    /**
     * Set the Core Token directly and persist it.
     */
    async setCoreToken(token: string): Promise<void> {
        await this.platform.storage.setItem(this.TOKEN_KEY, token);
    }

    /**
     * Retrieve the stored Core Token.
     */
    async getCoreToken(): Promise<string | null> {
        return await this.platform.storage.getItem(this.TOKEN_KEY);
    }

    /**
     * Exchange a third-party token for a Core Token.
     * @param host API Host
     * @param token Third-party token (e.g., Supabase JWT)
     * @param provider Provider name ('supabase' | 'authing')
     */
    async exchangeToken(host: string, token: string, provider: "supabase" | "authing"): Promise<string> {
        const endpoint = `https://${host}/api/auth/exchange-token`;

        try {
            const response = await this.platform.transport.request<{ coreToken: string }>(
                "POST",
                endpoint,
                {
                    supabaseToken: provider === "supabase" ? token : undefined,
                    authingToken: provider === "authing" ? token : undefined,
                }
            );

            if (response && response.coreToken) {
                await this.setCoreToken(response.coreToken);
                return response.coreToken;
            } else {
                throw new Error("Invalid response from token exchange");
            }
        } catch (error) {
            console.error("Token exchange failed:", error);
            throw error;
        }
    }

    /**
     * Clear the stored token.
     */
    async logout(): Promise<void> {
        await this.platform.storage.removeItem(this.TOKEN_KEY);
    }
}
