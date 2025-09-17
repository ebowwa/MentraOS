/**
 * Quick test to verify language code normalization fix
 */

import { SonioxTranslationUtils } from "./packages/cloud/src/services/session/transcription/providers/SonioxTranslationUtils";

console.log("Testing Soniox language code normalization...\n");

// Test cases from the error log - updated with actual Soniox capabilities
const testCases = [
  { source: "fr-FR", target: "ko-KR", expected: true }, // ✅ This was the main issue - now fixed!
  { source: "fr-FR", target: "en-US", expected: false }, // ❌ Soniox excludes fr→en (but allows en→fr)
  { source: "fr-FR", target: "es-ES", expected: true }, // ✅ Supported
  { source: "fr-FR", target: "de-DE", expected: true }, // ✅ Supported
  { source: "fr-FR", target: "it-IT", expected: true }, // ✅ Supported
  { source: "fr-FR", target: "pt-BR", expected: false }, // ❌ Only en,es→pt supported
  { source: "en-US", target: "ko-KR", expected: true }, // ✅ Supported
  { source: "zh-CN", target: "ko-KR", expected: true }, // ✅ Supported
];

console.log("Language code normalization tests:");
testCases.forEach(({ source, target }) => {
  const normalizedSource = SonioxTranslationUtils.normalizeLanguageCode(source);
  const normalizedTarget = SonioxTranslationUtils.normalizeLanguageCode(target);
  console.log(
    `${source} → ${normalizedSource}, ${target} → ${normalizedTarget}`,
  );
});

console.log("\nTranslation support tests:");
let allPassed = true;
testCases.forEach(({ source, target, expected }) => {
  const isSupported = SonioxTranslationUtils.supportsTranslation(
    source,
    target,
  );
  const status = isSupported === expected ? "✅" : "❌";
  if (isSupported !== expected) allPassed = false;
  console.log(
    `${status} ${source} → ${target}: ${isSupported} (expected: ${expected})`,
  );
});

console.log(`\nTest ${allPassed ? "PASSED" : "FAILED"}!`);

// Specifically test the error case: fr-FR to ko-KR
const problemCase = SonioxTranslationUtils.supportsTranslation(
  "fr-FR",
  "ko-KR",
);
console.log(
  `\n🎯 Problem case fr-FR → ko-KR: ${problemCase ? "✅ FIXED" : "❌ STILL BROKEN"}`,
);
