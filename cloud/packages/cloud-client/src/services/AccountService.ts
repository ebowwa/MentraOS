/**
 * AccountService - Generate core tokens directly using JWT secret
 * This bypasses the need for Supabase account creation and token exchange
 */

import jwt from "jsonwebtoken";

export interface AccountCredentials {
  email: string;
  coreToken: string;
}

export interface CoreTokenPayload {
  sub: string;
  email: string;
  organizations: any[];
  defaultOrg: any;
  iat?: number;
}

export class AccountService {
  private jwtSecret: string;

  constructor(jwtSecret?: string) {
    this.jwtSecret = jwtSecret || process.env.AUGMENTOS_AUTH_JWT_SECRET || "";

    if (!this.jwtSecret) {
      throw new Error(
        "AUGMENTOS_AUTH_JWT_SECRET is required for AccountService",
      );
    }
  }

  /**
   * Generate a core token for the given email
   * This mirrors the generateCoreToken function from the backend
   */
  generateCoreToken(
    email: string,
    options: {
      sub?: string;
      organizations?: any[];
      defaultOrg?: any;
    } = {},
  ): string {
    const payload: CoreTokenPayload = {
      sub: options.sub || this.generateSubId(),
      email: email.toLowerCase(),
      organizations: options.organizations || [],
      defaultOrg: options.defaultOrg || null,
    };

    return jwt.sign(payload, this.jwtSecret);
  }

  /**
   * Create account credentials for testing
   */
  createTestAccount(email: string): AccountCredentials {
    const coreToken = this.generateCoreToken(email);

    return {
      email: email.toLowerCase(),
      coreToken,
    };
  }

  /**
   * Create multiple test accounts
   */
  createTestAccounts(
    emailTemplate: string, // e.g., 'test-{id}@example.com'
    count: number,
  ): AccountCredentials[] {
    const accounts: AccountCredentials[] = [];

    for (let i = 0; i < count; i++) {
      const email = emailTemplate.replace("{id}", i.toString());
      accounts.push(this.createTestAccount(email));
    }

    return accounts;
  }

  /**
   * Verify and decode a core token
   */
  verifyCoreToken(token: string): CoreTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as CoreTokenPayload;
      return decoded;
    } catch (error) {
      console.error("Failed to verify core token:", error);
      return null;
    }
  }

  /**
   * Get pre-existing default test user account
   */
  getDefaultTestAccount(): AccountCredentials {
    const defaultTestToken = process.env.JOE_MAMA_USER_JWT;

    if (!defaultTestToken) {
      throw new Error(
        "Default test user token not found in environment variables",
      );
    }

    // Verify the token and extract email
    const decoded = this.verifyCoreToken(defaultTestToken);
    if (!decoded) {
      throw new Error("Invalid default test user token");
    }

    return {
      email: decoded.email,
      coreToken: defaultTestToken,
    };
  }

  /**
   * Generate a random subject ID (mimics backend behavior)
   */
  private generateSubId(): string {
    return Math.random().toString().substring(2);
  }

  /**
   * Static factory method using environment variables
   */
  static fromEnvironment(): AccountService {
    return new AccountService();
  }

  /**
   * Helper to generate account for common test scenarios
   */
  static generateTestAccount(email: string): AccountCredentials {
    const service = AccountService.fromEnvironment();
    return service.createTestAccount(email);
  }

  /**
   * Helper to get pre-configured default test account
   */
  static getDefaultTestAccount(): AccountCredentials {
    const service = AccountService.fromEnvironment();
    return service.getDefaultTestAccount();
  }
}
