/**
 * Quick test to verify language code normalization fix
 */

const { SonioxTranslationUtils } = require('./packages/cloud/dist/services/session/transcription/providers/SonioxTranslationUtils.js');

console.log('Testing Soniox language code normalization...\n');

// Test cases from the error log
const testCases = [
  { source: 'fr-FR', target: 'ko-KR', expected: true },
  { source: 'fr-FR', target: 'en-US', expected: true },
  { source: 'fr-FR', target: 'es-ES', expected: true },
  { source: 'fr-FR', target: 'de-DE', expected: true },
  { source: 'fr-FR', target: 'it-IT', expected: true },
  { source: 'fr-FR', target: 'pt-BR', expected: true },
  { source: 'en-US', target: 'ko-KR', expected: true },
  { source: 'zh-CN', target: 'ko-KR', expected: true },
];

console.log('Language code normalization tests:');
testCases.forEach(({ source, target }) => {
  const normalizedSource = SonioxTranslationUtils.normalizeLanguageCode(source);
  const normalizedTarget = SonioxTranslationUtils.normalizeLanguageCode(target);
  console.log(`${source} → ${normalizedSource}, ${target} → ${normalizedTarget}`);
});

console.log('\nTranslation support tests:');
testCases.forEach(({ source, target, expected }) => {
  const isSupported = SonioxTranslationUtils.supportsTranslation(source, target);
  const status = isSupported === expected ? '✅' : '❌';
  console.log(`${status} ${source} → ${target}: ${isSupported} (expected: ${expected})`);
});

console.log('\nTest completed!');