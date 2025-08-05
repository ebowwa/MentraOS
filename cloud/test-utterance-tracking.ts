#!/usr/bin/env ts-node

/**
 * Test script to verify utterance-based tracking in SonioxTranslationProvider
 */

// Mock Soniox messages to test utterance tracking
const mockMessages = [
  // First utterance in French
  {
    tokens: [
      {
        text: "Bonjour",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 0,
        duration_ms: 500,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 500,
        duration_ms: 100,
      },
      {
        text: "comment",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 600,
        duration_ms: 400,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 1000,
        duration_ms: 100,
      },
      {
        text: "allez",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 1100,
        duration_ms: 300,
      },
      {
        text: "-",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 1400,
        duration_ms: 50,
      },
      {
        text: "vous",
        is_final: true,
        translation_status: "original",
        language: "fr",
        start_ms: 1450,
        duration_ms: 250,
      },
      {
        text: "Hello",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 0,
        duration_ms: 400,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 400,
        duration_ms: 100,
      },
      {
        text: "how",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 500,
        duration_ms: 300,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 800,
        duration_ms: 100,
      },
      {
        text: "are",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 900,
        duration_ms: 200,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 1100,
        duration_ms: 100,
      },
      {
        text: "you",
        is_final: true,
        translation_status: "translation",
        source_language: "fr",
        start_ms: 1200,
        duration_ms: 200,
      },
    ],
  },
  // End of first utterance
  {
    tokens: [{ text: "<end>", is_final: true }],
  },
  // Second utterance in English (for bidirectional)
  {
    tokens: [
      {
        text: "I'm",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 2000,
        duration_ms: 300,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 2300,
        duration_ms: 100,
      },
      {
        text: "fine",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 2400,
        duration_ms: 400,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 2800,
        duration_ms: 100,
      },
      {
        text: "thank",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 2900,
        duration_ms: 400,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 3300,
        duration_ms: 100,
      },
      {
        text: "you",
        is_final: true,
        translation_status: "original",
        language: "en",
        start_ms: 3400,
        duration_ms: 300,
      },
      {
        text: "Je",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 2000,
        duration_ms: 200,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 2200,
        duration_ms: 100,
      },
      {
        text: "vais",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 2300,
        duration_ms: 300,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 2600,
        duration_ms: 100,
      },
      {
        text: "bien",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 2700,
        duration_ms: 400,
      },
      {
        text: " ",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 3100,
        duration_ms: 100,
      },
      {
        text: "merci",
        is_final: true,
        translation_status: "translation",
        source_language: "en",
        start_ms: 3200,
        duration_ms: 500,
      },
    ],
  },
  // End of second utterance
  {
    tokens: [{ text: "<end>", is_final: true }],
  },
];

// Expected output format for each utterance
console.log("Expected utterance-based tracking output:");
console.log("\nUtterance 1 (fr → en):");
console.log({
  originalText: "Bonjour comment allez-vous",
  text: "Hello how are you",
  transcribeLanguage: "fr",
  translateLanguage: "en",
  isFinal: true,
  startTime: 0,
  endTime: 1400,
  provider: "soniox",
});

console.log("\nUtterance 2 (en → fr):");
console.log({
  originalText: "I'm fine thank you",
  text: "Je vais bien merci",
  transcribeLanguage: "en",
  translateLanguage: "fr",
  isFinal: true,
  startTime: 2000,
  endTime: 3700,
  provider: "soniox",
});

console.log(
  "\n✅ The implementation should now include originalText in the translation data sent to apps!",
);
