# Soniox Translation System: Edge Case Analysis and Implementation Design

## Problem Statement

The current transcription/translation system creates resource conflicts when apps subscribe to overlapping language pairs. Translation streams currently send both transcription and translation data, causing duplicate transcription data when multiple streams process the same source language.

## Soniox API Constraints

Based on Soniox documentation, the real-time translation API supports:

1. **One-way translation**: Multiple source languages → single target language
2. **Two-way translation**: Bidirectional between exactly two languages  
3. **Universal English**: `"*"` source languages → English only
4. **No multi-target**: Cannot translate to multiple target languages simultaneously

**Configuration Examples:**
```json
// One-way: English to Spanish
{
  "translation": {
    "type": "one_way",
    "target_language": "es",
    "source_languages": ["en"]
  }
}

// Two-way: English ↔ Spanish
{
  "translation": {
    "type": "two_way",
    "language_a": "en",
    "language_b": "es"
  }
}

// Universal English: Any language → English
{
  "translation": {
    "type": "one_way",
    "target_language": "en",
    "source_languages": ["*"]
  }
}
```

## Edge Cases Analysis

### Edge Case 1: Source Language Overlap
**Subscriptions:**
```typescript
['transcription:en-US', 'translation:en-US->es-ES', 'translation:en-US->fr-FR']
```

**Problem:** Multiple streams process English audio, all potentially sending English transcription data.

**Current Behavior:**
- Stream 1 (transcription:en-US): Sends English transcription
- Stream 2 (en->es translation): Sends English transcription + Spanish translation
- Stream 3 (en->fr translation): Sends English transcription + French translation

**Result:** Apps subscribed to `transcription:en-US` receive duplicate data from all three streams.

### Edge Case 2: Two-Way Translation Optimization
**Subscriptions:**
```typescript
['translation:en-US->es-ES', 'translation:es-ES->en-US']
```

**Optimization Opportunity:** Single two-way stream can handle both subscriptions.

**Current Behavior:** Two separate streams
**Optimized Behavior:** One two-way stream handles both

### Edge Case 3: Universal English with Specific Transcription
**Subscriptions:**
```typescript
['transcription:en-US', 'translation:fr-FR->en-US', 'translation:de-DE->en-US']
```

**Optimization Opportunity:** Universal English stream can handle both translations.

**Conflict:** Universal stream would send English transcription, duplicating the dedicated transcription stream.

### Edge Case 4: Complex Multi-Language Scenario
**Subscriptions:**
```typescript
[
  'transcription:en-US',
  'transcription:es-ES',
  'translation:en-US->es-ES',
  'translation:es-ES->en-US',
  'translation:fr-FR->en-US'
]
```

**Optimization Opportunities:**
- Two-way stream for en↔es
- Universal English stream for fr->en
- Dedicated transcription streams for en and es

**Conflicts:** All streams could potentially send English and Spanish transcription data.

## Solution: Transcription Ownership Hierarchy

### Core Principle
Only one stream can send transcription data for any given language. Establish clear ownership hierarchy to prevent conflicts.

### Ownership Hierarchy (Highest to Lowest Priority)
1. **Dedicated Transcription Streams** - Always own their target language
2. **Two-Way Translation Streams** - Own both languages if no dedicated stream
3. **Universal English Stream** - Owns English if no higher priority stream
4. **One-Way Translation Streams** - Lowest priority, only if no alternatives

### Implementation Strategy

#### Step 1: Identify Required Transcription Languages
```typescript
function getRequiredTranscriptionLanguages(subscriptions: ExtendedStreamType[]): Set<string> {
  const languages = new Set<string>();
  
  subscriptions.forEach(sub => {
    if (sub.startsWith('transcription:')) {
      const langInfo = getLanguageInfo(sub);
      languages.add(langInfo.transcribeLanguage);
    }
  });
  
  return languages;
}
```

#### Step 2: Create Dedicated Transcription Streams
```typescript
function createTranscriptionStreams(
  subscriptions: ExtendedStreamType[],
  requiredLanguages: Set<string>
): OptimizedStream[] {
  const streams: OptimizedStream[] = [];
  
  for (const language of requiredLanguages) {
    const transcriptionSubs = subscriptions.filter(sub => 
      sub.startsWith('transcription:') && 
      getLanguageInfo(sub).transcribeLanguage === language
    );
    
    if (transcriptionSubs.length > 0) {
      streams.push({
        type: 'dedicated_transcription',
        config: { language },
        handledSubscriptions: transcriptionSubs,
        ownsTranscription: [language],
        skipTranscriptionFor: []
      });
    }
  }
  
  return streams;
}
```

#### Step 3: Create Translation Streams with Ownership Logic
```typescript
function createTranslationStreams(
  subscriptions: ExtendedStreamType[],
  ownedTranscriptionLanguages: Set<string>
): OptimizedStream[] {
  const streams: OptimizedStream[] = [];
  const translationSubs = subscriptions.filter(s => s.startsWith('translation:'));
  const processed = new Set<string>();
  
  for (const sub of translationSubs) {
    if (processed.has(sub)) continue;
    
    const langInfo = getLanguageInfo(sub);
    const sourceLanguage = langInfo.transcribeLanguage;
    const targetLanguage = langInfo.translateLanguage;
    
    // Check for two-way optimization
    const reverseSub = `translation:${targetLanguage}-to-${sourceLanguage}`;
    if (translationSubs.includes(reverseSub)) {
      streams.push({
        type: 'two_way',
        config: {
          language: 'auto',
          translation: {
            type: 'two_way',
            language_a: sourceLanguage,
            language_b: targetLanguage
          }
        },
        handledSubscriptions: [sub, reverseSub],
        ownsTranscription: [],
        skipTranscriptionFor: Array.from(ownedTranscriptionLanguages)
      });
      
      processed.add(sub);
      processed.add(reverseSub);
    } else {
      // One-way translation
      streams.push({
        type: 'one_way',
        config: {
          language: sourceLanguage,
          translation: {
            type: 'one_way',
            target_language: targetLanguage,
            source_languages: [sourceLanguage]
          }
        },
        handledSubscriptions: [sub],
        ownsTranscription: [],
        skipTranscriptionFor: Array.from(ownedTranscriptionLanguages)
      });
      
      processed.add(sub);
    }
  }
  
  return streams;
}
```

#### Step 4: Token Routing with Ownership Logic
```typescript
class OptimizedSonioxStream {
  private routeTokens(tokens: SonioxToken[]): void {
    const tokensByLanguage = this.groupTokensByLanguage(tokens);
    
    for (const [detectedLanguage, langTokens] of tokensByLanguage) {
      // Check ownership before sending transcription data
      const ownsTranscription = this.streamConfig.ownsTranscription.includes(detectedLanguage);
      const shouldSkipTranscription = this.streamConfig.skipTranscriptionFor.includes(detectedLanguage);
      
      // Send transcription data only if we own it
      if (ownsTranscription && !shouldSkipTranscription) {
        this.sendTranscriptionData(detectedLanguage, langTokens);
      }
      
      // Always send translation data for target languages
      this.sendTranslationData(detectedLanguage, langTokens);
    }
  }
  
  private sendTranscriptionData(language: string, tokens: SonioxToken[]): void {
    const transcriptionSubs = this.getTranscriptionSubscriptionsForLanguage(language);
    
    for (const subscription of transcriptionSubs) {
      const transcriptionData: TranscriptionData = {
        type: StreamType.TRANSCRIPTION,
        text: this.buildTextFromTokens(tokens),
        isFinal: tokens.every(t => t.is_final),
        transcribeLanguage: language,
        provider: 'soniox'
      };
      
      this.callbacks.onData(transcriptionData);
    }
  }
  
  private sendTranslationData(language: string, tokens: SonioxToken[]): void {
    const translationSubs = this.getTranslationSubscriptionsForTargetLanguage(language);
    
    for (const subscription of translationSubs) {
      const langInfo = getLanguageInfo(subscription);
      
      const translationData: TranslationData = {
        type: StreamType.TRANSLATION,
        text: this.buildTextFromTokens(tokens),
        originalText: '', // Soniox doesn't provide original text in grouped tokens
        isFinal: tokens.every(t => t.is_final),
        transcribeLanguage: langInfo.transcribeLanguage,
        translateLanguage: langInfo.translateLanguage,
        didTranslate: true,
        provider: 'soniox'
      };
      
      this.callbacks.onData(translationData);
    }
  }
}
```

## Edge Case Solutions

### Edge Case 1 Solution: Source Language Overlap
**Input:**
```typescript
['transcription:en-US', 'translation:en-US->es-ES', 'translation:en-US->fr-FR']
```

**Optimized Streams:**
```typescript
[
  {
    type: 'dedicated_transcription',
    config: { language: 'en' },
    handledSubscriptions: ['transcription:en-US'],
    ownsTranscription: ['en'],
    skipTranscriptionFor: []
  },
  {
    type: 'one_way',
    config: { language: 'en', translation: { type: 'one_way', target_language: 'es' } },
    handledSubscriptions: ['translation:en-US->es-ES'],
    ownsTranscription: [],
    skipTranscriptionFor: ['en']
  },
  {
    type: 'one_way',
    config: { language: 'en', translation: { type: 'one_way', target_language: 'fr' } },
    handledSubscriptions: ['translation:en-US->fr-FR'],
    ownsTranscription: [],
    skipTranscriptionFor: ['en']
  }
]
```

**Result:** Only the dedicated transcription stream sends English transcription data.

### Edge Case 2 Solution: Two-Way Optimization
**Input:**
```typescript
['translation:en-US->es-ES', 'translation:es-ES->en-US']
```

**Optimized Streams:**
```typescript
[
  {
    type: 'two_way',
    config: {
      language: 'auto',
      translation: { type: 'two_way', language_a: 'en', language_b: 'es' }
    },
    handledSubscriptions: ['translation:en-US->es-ES', 'translation:es-ES->en-US'],
    ownsTranscription: [],
    skipTranscriptionFor: []
  }
]
```

**Result:** Single stream handles both translation directions.

### Edge Case 3 Solution: Universal English with Conflict Prevention
**Input:**
```typescript
['transcription:en-US', 'translation:fr-FR->en-US', 'translation:de-DE->en-US']
```

**Optimized Streams:**
```typescript
[
  {
    type: 'dedicated_transcription',
    config: { language: 'en' },
    handledSubscriptions: ['transcription:en-US'],
    ownsTranscription: ['en'],
    skipTranscriptionFor: []
  },
  {
    type: 'universal_english',
    config: {
      language: 'auto',
      translation: { type: 'one_way', target_language: 'en', source_languages: ['*'] }
    },
    handledSubscriptions: ['translation:fr-FR->en-US', 'translation:de-DE->en-US'],
    ownsTranscription: [],
    skipTranscriptionFor: ['en']
  }
]
```

**Result:** Universal stream handles both translations but skips English transcription.

## Implementation Requirements

### New Stream Configuration Interface
```typescript
interface OptimizedStream {
  type: 'dedicated_transcription' | 'universal_english' | 'two_way' | 'one_way';
  config: SonioxStreamConfig;
  handledSubscriptions: ExtendedStreamType[];
  ownsTranscription: string[];
  skipTranscriptionFor: string[];
}
```

### Modified TranscriptionManager
```typescript
class TranscriptionManager {
  async updateSubscriptions(subscriptions: ExtendedStreamType[]): Promise<void> {
    const requiredTranscriptionLanguages = this.getRequiredTranscriptionLanguages(subscriptions);
    const optimizedStreams = this.optimizeSubscriptions(subscriptions, requiredTranscriptionLanguages);
    
    // Update streams based on optimized configuration
    await this.updateStreamsFromOptimization(optimizedStreams);
  }
  
  private optimizeSubscriptions(
    subscriptions: ExtendedStreamType[],
    requiredTranscriptionLanguages: Set<string>
  ): OptimizedStream[] {
    const transcriptionStreams = this.createTranscriptionStreams(subscriptions, requiredTranscriptionLanguages);
    const translationStreams = this.createTranslationStreams(subscriptions, requiredTranscriptionLanguages);
    
    return [...transcriptionStreams, ...translationStreams];
  }
}
```

### Token Processing Logic
```typescript
private processTokensWithOwnership(tokens: SonioxToken[]): void {
  const tokensByLanguage = this.groupTokensByLanguage(tokens);
  
  for (const [detectedLanguage, langTokens] of tokensByLanguage) {
    // Route to transcription subscriptions only if we own the language
    if (this.ownsTranscription.includes(detectedLanguage) && 
        !this.skipTranscriptionFor.includes(detectedLanguage)) {
      this.routeToTranscriptionSubscriptions(detectedLanguage, langTokens);
    }
    
    // Route to translation subscriptions for target languages
    this.routeToTranslationSubscriptions(detectedLanguage, langTokens);
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('Transcription Ownership Logic', () => {
  it('should prevent duplicate transcription data', () => {
    const subscriptions = ['transcription:en-US', 'translation:en-US->es-ES'];
    const optimization = optimizeSubscriptions(subscriptions);
    
    // Only one stream should own English transcription
    const englishOwners = optimization.filter(s => s.ownsTranscription.includes('en'));
    expect(englishOwners).toHaveLength(1);
    expect(englishOwners[0].type).toBe('dedicated_transcription');
  });
  
  it('should optimize two-way translations', () => {
    const subscriptions = ['translation:en-US->es-ES', 'translation:es-ES->en-US'];
    const optimization = optimizeSubscriptions(subscriptions);
    
    expect(optimization).toHaveLength(1);
    expect(optimization[0].type).toBe('two_way');
    expect(optimization[0].handledSubscriptions).toHaveLength(2);
  });
});
```

### Integration Tests
```typescript
describe('Stream Token Routing', () => {
  it('should route tokens correctly with ownership', async () => {
    const stream = new OptimizedSonioxStream({
      ownsTranscription: ['en'],
      skipTranscriptionFor: [],
      handledSubscriptions: ['transcription:en-US']
    });
    
    const mockTokens = [{ language: 'en', text: 'hello', is_final: true }];
    
    // Should send transcription data since it owns English
    await stream.processTokens(mockTokens);
    
    expect(mockTranscriptionCallback).toHaveBeenCalledWith(
      expect.objectContaining({ type: StreamType.TRANSCRIPTION, text: 'hello' })
    );
  });
});
```

## Performance Considerations

### Stream Consolidation Benefits
- **Two-way optimization**: 2 streams → 1 stream (50% reduction)
- **Universal English**: N streams → 1 stream (up to 90% reduction for multi-language scenarios)
- **Dedicated transcription**: Prevents duplicate processing

### Resource Usage
- **WebSocket connections**: Reduced by stream consolidation
- **Audio processing**: Single stream processes audio once instead of multiple times
- **Memory usage**: Shared token buffers for consolidated streams

## Backwards Compatibility

### SDK Interface
No changes required to existing SDK interfaces. Apps continue using the same subscription strings:
- `transcription:en-US`
- `translation:en-US->es-ES`

### Data Format
TranscriptionData and TranslationData interfaces remain unchanged. Apps receive the same data structures.

### Error Handling
Existing error handling patterns preserved. New optimization failures fall back to individual stream creation.