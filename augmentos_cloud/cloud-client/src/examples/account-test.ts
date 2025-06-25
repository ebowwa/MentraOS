/**
 * Test the AccountService to verify JWT token generation works
 */

import { AccountService } from '../services/AccountService';

async function testAccountService() {
  console.log('🔑 Testing AccountService...\n');

  try {
    // Test 1: Get default test account
    console.log('1. Testing default test account:');
    const defaultAccount = AccountService.getDefaultTestAccount();
    console.log(`   Email: ${defaultAccount.email}`);
    console.log(`   Token: ${defaultAccount.coreToken.substring(0, 50)}...`);
    
    // Verify the token
    const service = AccountService.fromEnvironment();
    const decoded = service.verifyCoreToken(defaultAccount.coreToken);
    console.log(`   Decoded: ${JSON.stringify(decoded, null, 2)}`);
    console.log('   ✅ Default account works!\n');

    // Test 2: Generate new test account
    console.log('2. Testing new account generation:');
    const newAccount = AccountService.generateTestAccount('test-user@example.com');
    console.log(`   Email: ${newAccount.email}`);
    console.log(`   Token: ${newAccount.coreToken.substring(0, 50)}...`);
    
    const decodedNew = service.verifyCoreToken(newAccount.coreToken);
    console.log(`   Decoded: ${JSON.stringify(decodedNew, null, 2)}`);
    console.log('   ✅ New account generation works!\n');

    // Test 3: Generate multiple accounts
    console.log('3. Testing multiple account generation:');
    const accounts = service.createTestAccounts('stress-test-{id}@example.com', 3);
    accounts.forEach((account, index) => {
      console.log(`   Account ${index + 1}: ${account.email}`);
    });
    console.log('   ✅ Multiple account generation works!\n');

    console.log('🎉 All AccountService tests passed!');

  } catch (error) {
    console.error('❌ AccountService test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testAccountService().catch(console.error);
}

export { testAccountService };