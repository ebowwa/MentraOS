/**
 * Test file to verify reporting system initialization
 * This can be used to test that all providers are working correctly
 */

import { initializeReporting, reportError, reportInfo } from './index'

/**
 * Test the reporting system initialization
 */
export const testReportingSystem = async (): Promise<void> => {
  try {
    console.log('🧪 Testing reporting system initialization...')
    
    // Initialize the reporting system
    await initializeReporting()
    
    // Test error reporting
    reportError('Test error message', 'test.domain', 'test_operation')
    
    // Test info reporting
    reportInfo('Test info message', 'test.domain', 'test_operation')
    
    console.log('✅ Reporting system test completed successfully')
  } catch (error) {
    console.error('❌ Reporting system test failed:', error)
  }
}

/**
 * Test individual providers
 */
export const testProviders = async (): Promise<void> => {
  try {
    console.log('🧪 Testing individual providers...')
    
    const { getProviderStatus } = await import('./index')
    const status = getProviderStatus()
    
    console.log('Provider Status:', status)
    
    Object.entries(status).forEach(([provider, { enabled, initialized }]) => {
      console.log(`${provider}: ${enabled ? '✅' : '❌'} enabled, ${initialized ? '✅' : '❌'} initialized`)
    })
    
  } catch (error) {
    console.error('❌ Provider test failed:', error)
  }
} 