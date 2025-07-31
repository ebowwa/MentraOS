# Soniox Translation Design Document

## Overview

Soniox provides unified transcription+translation in a single stream, with special handling for English and language-specific pairing constraints. This document outlines the architecture for implementing Soniox translation in the TranscriptionManager.

## Soniox Translation Capabilities

### 1. English as Universal Target ("\*" → "en")

```json
{
  "translation": {
    "type": "one_way",
    "target_language": "en"
  }
}
```

- **Input**: All languages automatically detected
- **Output**: Transcription in original language + translation to English
- **Use Case**: Universal translation to English

### 2. Multiple Sources to Single Target

```json
{
  "translation": {
    "type": "one_way",
    "target_language": "ko",
    "source_languages": ["zh", "ja"]
  }
}
```

- **Input**: Only Chinese and Japanese detected
- **Output**: Transcription in original + translation to Korean
- **Constraint**: Limited by Soniox's supported language pairs

### 3. Two-Way Translation

```json
{
  "translation": {
    "type": "two_way",
    "language_a": "en",
    "language_b": "es"
  }
}
```

- **Input**: English and Spanish detected
- **Output**: Transcription + cross-translation (en→es, es→en)

## Stream Optimization Strategy

### Stream Consolidation Rules

1. **Universal English Stream**: If any app needs "X→en", create one "\*→en" stream
2. **Language-Specific Streams**: Create separate streams for specific language pairs
3. **Bidirectional Streams**: Use two-way config when apps need both directions

### Example Subscription Analysis

```typescript
// Apps subscribe to:
[
  "transcription:en-US",
  "transcription:es-ES",
  "translation:en-US->es-ES",
  "translation:es-ES->en-US",
  "translation:ja-JP->en-US",
  "translation:ko-KR->en-US"
]

// Optimized stream creation:
Stream 1: {
  language: "auto",
  translation: {
    type: "two_way",
    language_a: "en",
    language_b: "es"
  }
}
// Handles: transcription:en-US, transcription:es-ES, translation:en-US->es-ES, translation:es-ES->en-US

Stream 2: {
  language: "auto",
  translation: {
    type: "one_way",
    target_language: "en",
    source_languages: ["ja", "ko"]  // If supported
  }
}
// Handles: translation:ja-JP->en-US, translation:ko-KR->en-US

// OR if source_languages not supported:
Stream 2: { language: "ja", translation: { type: "one_way", target_language: "en" }}
Stream 3: { language: "ko", translation: { type: "one_way", target_language: "en" }}
```

## Implementation Architecture

### 1. Subscription Analysis Phase

```typescript
interface LanguageGroup {
  transcription: boolean;
  translationsTo: Set<string>;    // Languages this translates TO
  translationsFrom: Set<string>;  // Languages this translates FROM
}

// Group subscriptions by language
const languageGroups: Map<string, LanguageGroup> = new Map();

// Analyze patterns
const patterns = {
  universalToEnglish: boolean;    // Any X→en translations
  englishSpecificSources: Set<string>;  // Specific sources for en
  bidirectionalPairs: Array<[string, string]>;
  specificPairs: Array<[string, string]>;
}
```

### 2. Stream Optimization Logic

```typescript
function optimizeStreams(subscriptions: string[]): StreamConfig[] {
  const analysis = analyzeSubscriptions(subscriptions);
  const streams: StreamConfig[] = [];

  // 1. Universal English stream (if beneficial)
  if (analysis.universalToEnglish) {
    streams.push({
      config: { translation: { type: "one_way", target_language: "en" }},
      handles: [...] // All X→en subscriptions
    });
  }

  // 2. Bidirectional pairs
  analysis.bidirectionalPairs.forEach(([langA, langB]) => {
    streams.push({
      config: {
        translation: {
          type: "two_way",
          language_a: langA,
          language_b: langB
        }
      },
      handles: [
        `transcription:${langA}`,
        `transcription:${langB}`,
        `translation:${langA}->${langB}`,
        `translation:${langB}->${langA}`
      ]
    });
  });

  // 3. Specific pairs (fallback)
  // Create individual streams for remaining subscriptions

  return streams;
}
```

### 3. Token Routing

```typescript
function routeTokens(token: SonioxToken, streamConfig: StreamConfig) {
  const routes: Array<{ subscription: string; data: any }> = [];

  if (token.translation_status === "original") {
    // Route to transcription subscribers
    routes.push({
      subscription: `transcription:${token.language}`,
      data: createTranscriptionData(token),
    });
  } else if (token.translation_status === "translation") {
    // Route to translation subscribers
    routes.push({
      subscription: `translation:${token.source_language}->${token.language}`,
      data: createTranslationData(token),
    });
  }

  return routes;
}
```

## Language Support Matrix (Based on Real Soniox Mappings)

### Key Findings from SonioxTranslationMappings.json

1. **Universal to English**: `"*" -> "en"` with all languages excluded as sources (meaning any language can translate to English)
2. **Multi-source targets**: Several languages support multiple source languages:
   - **Chinese (zh)**: en, fr, de, it, ja, ko, es
   - **French (fr)**: zh, en, de, it, ja, ko, sl, es
   - **German (de)**: zh, en, fr, it, ja, ko, sl, es
   - **Italian (it)**: zh, en, fr, de, ja, ko, sl, es
   - **Japanese (ja)**: zh, en, fr, de, it, ko, es
   - **Korean (ko)**: zh, en, fr, de, it, ja, es
   - **Spanish (es)**: zh, en, fr, de, it, ja, ko, pt, sl
   - **Slovenian (sl)**: hr, en, fr, de, it, sr, es

3. **Two-way translation pairs**: 197 bidirectional pairs available

### Implementation Constants

```typescript
const SONIOX_TRANSLATION_SUPPORT = {
  // Universal to English (most important optimization)
  universalToEnglish: {
    sourceLanguages: ["*"],
    targetLanguage: "en",
    excludeSourceLanguages: ["en"], // Can't translate English to English
  },

  // Multi-source capable targets (for optimization)
  multiSourceTargets: {
    zh: ["en", "fr", "de", "it", "ja", "ko", "es"],
    fr: ["zh", "en", "de", "it", "ja", "ko", "sl", "es"],
    de: ["zh", "en", "fr", "it", "ja", "ko", "sl", "es"],
    it: ["zh", "en", "fr", "de", "ja", "ko", "sl", "es"],
    ja: ["zh", "en", "fr", "de", "it", "ko", "es"],
    ko: ["zh", "en", "fr", "de", "it", "ja", "es"],
    es: ["zh", "en", "fr", "de", "it", "ja", "ko", "pt", "sl"],
    sl: ["hr", "en", "fr", "de", "it", "sr", "es"],
  },

  // All two-way pairs (for bidirectional optimization)
  twoWayPairs: [
    "af:en",
    "sq:en",
    "ar:en",
    "az:en",
    "eu:en",
    "be:en",
    "bn:en",
    "bs:en",
    "bg:en",
    "ca:en",
    "zh:en",
    "zh:fr",
    "zh:de",
    "zh:it",
    "zh:ja",
    "zh:ko",
    "zh:es",
    "hr:en",
    "hr:sl",
    "cs:en",
    "da:en",
    "nl:en",
    "en:af",
    "en:sq",
    "en:ar",
    "en:az",
    "en:eu",
    "en:be",
    "en:bn",
    "en:bs",
    "en:bg",
    "en:ca",
    "en:zh",
    "en:hr",
    "en:cs",
    "en:da",
    "en:nl",
    "en:et",
    "en:fi",
    "en:fr",
    "en:gl",
    "en:de",
    "en:el",
    "en:gu",
    "en:he",
    "en:hi",
    "en:hu",
    "en:id",
    "en:it",
    "en:ja",
    "en:kn",
    "en:kk",
    "en:ko",
    "en:lv",
    "en:lt",
    "en:mk",
    "en:ms",
    "en:ml",
    "en:mr",
    "en:no",
    "en:fa",
    "en:pl",
    "en:pt",
    "en:pa",
    "en:ro",
    "en:ru",
    "en:sr",
    "en:sk",
    "en:sl",
    "en:es",
    "en:sw",
    "en:sv",
    "en:tl",
    "en:ta",
    "en:te",
    "en:th",
    "en:tr",
    "en:uk",
    "en:ur",
    "en:vi",
    "en:cy",
    "et:en",
    "fi:en",
    "fr:zh",
    "fr:en",
    "fr:de",
    "fr:it",
    "fr:ja",
    "fr:ko",
    "fr:sl",
    "fr:es",
    "gl:en",
    "de:zh",
    "de:en",
    "de:fr",
    "de:it",
    "de:ja",
    "de:ko",
    "de:sl",
    "de:es",
    "el:en",
    "gu:en",
    "he:en",
    "hi:en",
    "hu:en",
    "id:en",
    "it:zh",
    "it:en",
    "it:fr",
    "it:de",
    "it:ja",
    "it:ko",
    "it:sl",
    "it:es",
    "ja:zh",
    "ja:en",
    "ja:fr",
    "ja:de",
    "ja:it",
    "ja:ko",
    "ja:es",
    "kn:en",
    "kk:en",
    "ko:zh",
    "ko:en",
    "ko:fr",
    "ko:de",
    "ko:it",
    "ko:ja",
    "ko:es",
    "lv:en",
    "lt:en",
    "mk:en",
    "ms:en",
    "ml:en",
    "mr:en",
    "no:en",
    "fa:en",
    "pl:en",
    "pt:en",
    "pt:es",
    "pa:en",
    "ro:en",
    "ru:en",
    "sr:en",
    "sr:sl",
    "sk:en",
    "sl:hr",
    "sl:en",
    "sl:fr",
    "sl:de",
    "sl:it",
    "sl:sr",
    "sl:es",
    "es:zh",
    "es:en",
    "es:fr",
    "es:de",
    "es:it",
    "es:ja",
    "es:ko",
    "es:pt",
    "es:sl",
    "sw:en",
    "sv:en",
    "tl:en",
    "ta:en",
    "te:en",
    "th:en",
    "tr:en",
    "uk:en",
    "ur:en",
    "vi:en",
    "cy:en",
  ],
};
```

## Fallback Strategy

### Soniox → Azure Fallback

```typescript
// If Soniox doesn't support a language pair
if (!isSonioxSupported(sourceLang, targetLang)) {
  // Fall back to Azure separate streams
  createAzureTranscriptionStream(sourceLang);
  createAzureTranslationStream(sourceLang, targetLang);
}
```

### Stream Failure Handling

```typescript
// If optimized stream fails
if (optimizedStreamFails) {
  // Break down into individual streams
  createIndividualStreams(subscriptions);
}
```

## Current vs New Architecture

### Current Architecture (Broken for Soniox)

```
App subscribes to: ["transcription:en-US", "translation:en-US->es-ES"]
↓
TranscriptionManager creates:
- Stream 1: Soniox transcription:en-US
- Stream 2: Soniox translation:en-US->es-ES (❌ This doesn't exist in Soniox)
```

### New Architecture (Soniox-Compatible)

```
App subscribes to: ["transcription:en-US", "translation:en-US->es-ES"]
↓
TranscriptionManager analyzes subscriptions:
- Transcription needed: en-US
- Translation needed: en-US → es-ES
↓
Creates single Soniox stream with config:
{
  "language": "en-US",
  "translation": {
    "type": "two_way",
    "language_a": "en",
    "language_b": "es"
  }
}
↓
Soniox returns unified token stream:
[
  {text: "Hello", translation_status: "original", language: "en"},
  {text: "Hola", translation_status: "translation", language: "es", source_language: "en"}
]
↓
TranscriptionManager splits and routes:
- Send "Hello" to apps subscribed to "transcription:en-US"
- Send "Hola" to apps subscribed to "translation:en-US->es-ES"
```

## Benefits of This Design

1. **Efficiency**: Minimize streams through intelligent grouping
2. **Flexibility**: Support both consolidated and individual streams
3. **Compatibility**: Graceful fallback to Azure model
4. **Scalability**: Handle complex multi-language scenarios
5. **Performance**: Leverage Soniox's unified translation capabilities

## Implementation Phases

1. **Phase 1**: Basic unified stream (one transcription + one translation)
2. **Phase 2**: Stream optimization logic
3. **Phase 3**: Complex language pairing support
4. **Phase 4**: Dynamic stream management based on app subscriptions

## Key Differences from Azure

| Aspect        | Azure                                          | Soniox                                            |
| ------------- | ---------------------------------------------- | ------------------------------------------------- |
| API Model     | Separate transcription + translation services  | Unified transcription+translation                 |
| Streams       | Multiple streams (transcription + translation) | Single stream with translation config             |
| Process       | Sequential (transcribe → translate)            | Simultaneous (speech → transcription+translation) |
| Configuration | Separate stream subscriptions                  | Translation config on transcription stream        |
| Token Format  | Separate transcription/translation responses   | Unified token stream with translation_status      |

## Migration Strategy

1. **Detect translation subscriptions** in current subscription parsing
2. **Group subscriptions** by language pairs and optimization opportunities
3. **Create unified Soniox streams** with appropriate translation configs
4. **Parse and route tokens** based on translation_status
5. **Maintain Azure fallback** for unsupported language pairs
6. **Gradual rollout** starting with simple en<->es pairs

This design maintains backward compatibility while leveraging Soniox's unified translation capabilities for improved performance and efficiency.
