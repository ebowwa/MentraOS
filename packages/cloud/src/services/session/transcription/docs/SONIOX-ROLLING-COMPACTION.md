## Soniox transcription rolling compaction (final design)

### Purpose

- Keep tokens attached to interims for client UX, but bound interim size and memory during long utterances.
- Preserve external contract: the single final equals the last interim (no partial finals mid‑utterance).

### Scope

- Applies to `SonioxTranscriptionProvider` in `session/transcription`.
- `TranscriptionManager` history remains compacted text only (no token arrays stored in history).

### Current behavior summary

- Soniox streams cumulative tokens in order; tokens have `is_final` when stable.
- Provider previously accumulated all tokens into a buffer and emitted interims with the full set until `<end>`; final sent only at `<end>` or VAD stop.
- This caused large interim payloads and memory growth on long utterances without `<end>`.

### Final design: internal rolling compaction

- Maintain `stablePrefixText: string` for finalized text.
- For each incoming Soniox message (tokens in order):
  - If `token.is_final`: append `token.text` to `stablePrefixText` (don’t retain the token object).
  - Else: collect into `tailTokens` for the current interim.
- Interim emission:
  - `interimText = stablePrefixText + join(tailTokens.text)`
  - Emit only if changed; attach `metadata.soniox.tokens` for `tailTokens` only (bounded).
- Final emission:
  - On `<end>` or VAD stop, emit a single final with `text = last interimText`.
  - This guarantees final is a perfect replacement for the last interim.
- Error/close: reset `stablePrefixText` and last interim.

### Data shapes (unchanged externally)

- Interim `TranscriptionData`:
  - `text`, `isFinal: false`, `provider: 'soniox'`, `transcribeLanguage`, `metadata.soniox.tokens` = tail tokens only.
- Final `TranscriptionData`:
  - `text` (equals last interim), `isFinal: true`, metadata optional.
- `TranscriptionManager` history stores compact text segments only.

### Logging and observability

- Interims: log at debug a truncated text and `tailTokenCount`.
- Finals: log at debug truncated text; no large token dumps at info.
- Optional counters: total finalized chars (prefix length), current tail token count.

### Edge cases

- If Soniox ever duplicated final tokens, double-appends would be prevented by using only the current message’s `is_final` tokens; in practice Soniox final tokens are not re-sent as interim.
- Provider reconnect or error: finalize if needed; clear rolling state and resume.

### Why this works

- Memory: we never retain finalized tokens as objects; only tail tokens live in memory.
- Bounded interims: token arrays only for tail, not the entire utterance.
- Backward compatible: final equals last interim; no protocol changes for apps.
