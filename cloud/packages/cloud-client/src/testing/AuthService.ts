/**
 * AuthService - Test account creation and token management
 */

import { AccountService, type AccountCredentials } from '../services/AccountService';

export class AuthService {
  private accountService: AccountService;

  constructor() {
    this.accountService = AccountService.fromEnvironment();
  }

  /**
   * Create test account and get core token (now generates directly)
   */
  async createTestAccount(email: string, password?: string): Promise<string> {
    try {
      const credentials = this.accountService.createTestAccount(email);
      console.log(`[AuthService] Created test account: ${credentials.email}`);
      return credentials.coreToken;
    } catch (error) {
      throw new Error(`Failed to create test account: ${error}`);
    }
  }

  /**
   * Get core token for email (generates new token)
   */
  async getCoreToken(email: string, password?: string): Promise<string> {
    try {
      const credentials = this.accountService.createTestAccount(email);
      return credentials.coreToken;
    } catch (error) {
      throw new Error(`Failed to get core token: ${error}`);
    }
  }

  /**
   * Get the default test account credentials
   */
  getDefaultTestAccount(): AccountCredentials {
    return this.accountService.getDefaultTestAccount();
  }

  /**
   * Create multiple test accounts for stress testing
   */
  async createTestAccounts(
    emailTemplate: string, // e.g., 'test-{id}@example.com'
    count: number
  ): Promise<Array<{ email: string; coreToken: string }>> {
    try {
      const credentials = this.accountService.createTestAccounts(emailTemplate, count);
      console.log(`[AuthService] Created ${credentials.length}/${count} test accounts`);
      return credentials;
    } catch (error) {
      console.error(`[AuthService] Failed to create test accounts:`, error);
      return [];
    }
  }

  /**
   * Clean up test accounts (note: accounts are auto-created, no cleanup needed)
   */
  async cleanupTestAccounts(emails: string[]): Promise<void> {
    console.log('[AuthService] No cleanup needed - accounts are auto-created on connection');
    // Since we're generating tokens directly and accounts are created automatically
    // when users connect, there's no explicit cleanup needed for testing
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate random test credentials
   */
  static generateTestCredentials(): { email: string; coreToken: string } {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const email = `test-${timestamp}-${random}@example.com`;
    
    const service = AccountService.fromEnvironment();
    const credentials = service.createTestAccount(email);
    
    return credentials;
  }
}