# MentraOS Microphone Implementation Plan

## Problem Statement

Users complain that when running MentraOS, their audio quality in other apps (like Spotify) gets severely degraded. The audio switches from high-quality stereo to low-quality mono "phone call" sound.

### Root Causes Identified

**Old Android Code (pre-refactor):**

- Used `AudioManager.MODE_IN_CALL` when enabling Bluetooth
- Called `startBluetoothSco()` to activate SCO mode
- This switched Mentra Live from A2DP (high-quality music) → HFP (phone call quality)
- Result: All audio became mono 16kHz, degrading Spotify/YouTube/etc.

**New Android Code (post-refactor):**

- Uses `AudioManager.MODE_IN_COMMUNICATION`
- Still calls `startBluetoothSco()`
- Uses `MediaRecorder.AudioSource.VOICE_COMMUNICATION` (applies aggressive audio processing system-wide)
- Result: Still degrades audio, just differently

## Critical Context: How Our Glasses Actually Work

### Even Realities G1

- **Mic**: Custom BLE mic (LC3 audio chunks over GATT characteristic)
  - NOT a system microphone - doesn't register with Android audio system
  - Audio forwarded directly to cloud, not through Android audio stack
  - **Quality: Poor** - works but audio quality is not good
- **Speakers**: None
- **Strategy**:
  - Default to phone mic (better quality than G1's mic)
  - Fallback to custom G1 BLE mic only when phone mic unavailable (conflict with other apps)
  - Never use Bluetooth SCO/HFP (doesn't have it)

### Vuzix Z100

- **Mic**: None - NO onboard microphone at all
- **Speakers**: None
- **Strategy**:
  - Always use phone mic (only option)
  - Release phone mic if another app needs it (pause recording - cannot fallback to glasses mic)
  - Never use Bluetooth SCO/HFP (doesn't have HFP capability)
  - Note: Can use external Bluetooth lapel mic if user explicitly selects it

### Mentra Live

- **Mic**: Custom BLE mic (LC3 audio chunks over GATT characteristic)
  - NOT a system microphone - doesn't register with Android audio system
  - **Quality: Good** - actually decent audio quality
  - Has HFP capability but we don't want to use it
- **Speakers**: Yes (Bluetooth audio output)
- **Strategy**:
  - Always use custom BLE mic by default (good quality, no need for phone mic)
  - Never use HFP/SCO mic (keep A2DP active)
  - Output audio via A2DP only (high-quality music profile)
  - Never activate SCO - keep A2DP active for Spotify/etc.

### Key Insight

**We (almost) never need Bluetooth SCO/HFP!**

- **G1**: Has custom BLE mic (LC3 over GATT) but quality is poor → default to phone mic, fallback to G1 mic on conflict
- **Mentra Live**: Has custom BLE mic (LC3 over GATT) with good quality → default to glasses mic, no phone mic needed
- **Z100**: Has no mic at all → phone mic only
- None of the glasses use HFP audio input for their custom mics
- Mentra Live needs A2DP output (not HFP output)
- **Exception**: Some Deaf/Hard of Hearing users use external Bluetooth lapel mics for live captions
  - These ARE traditional HFP devices that need SCO activation
  - But since users are Deaf/HoH, audio output degradation doesn't matter (they're not listening to music)
  - This is a manual opt-in feature, not default behavior

## The Solution

### Core Principle

**Never activate Bluetooth SCO.** Use phone mic with clean audio recording, let Bluetooth output route naturally via A2DP.

### Configuration

| Aspect                 | Value                       | Reason                            |
| ---------------------- | --------------------------- | --------------------------------- |
| Audio Mode             | `MODE_NORMAL`               | Don't interfere with BT routing   |
| Audio Source           | `MIC` or `CAMCORDER`        | Clean recording, no processing    |
| Audio Source (Samsung) | `VOICE_RECOGNITION`         | Better app cooperation on Samsung |
| Audio Focus            | `AUDIOFOCUS_GAIN_TRANSIENT` | Temporary mic use for recording   |
| SCO                    | **Never call it**           | All mics are custom BLE or phone  |
| Output                 | Natural routing             | A2DP stays active for music       |

### Why This Works

**For Phone Mic (G1 default, Z100 only option):**

- ✅ Records from phone mic cleanly
- ✅ `MODE_NORMAL` doesn't interfere with Bluetooth routing
- ✅ A2DP stays active for music playback
- ✅ `AUDIOFOCUS_GAIN_TRANSIENT` signals temporary mic use
- ✅ Other apps' audio can duck or pause (their choice)

**For Mentra Live (glasses mic default):**

- ✅ **Never activates SCO** - leaves A2DP alone
- ✅ Spotify continues in high-quality stereo
- ✅ Your TTS/notifications play through A2DP naturally
- ✅ Custom BLE mic works independently (not tied to audio system)
- ✅ Good audio quality from glasses mic

**For Conflict Handling (G1):**

- ✅ `AudioRecordingCallback` detects other apps recording
- ✅ Audio focus loss listener triggers
- ✅ Switch from phone mic → G1's custom BLE mic (fallback, lower quality but works)
- ✅ Restore phone mic when conflict clears

**For Conflict Handling (Z100):**

- ✅ `AudioRecordingCallback` detects other apps recording
- ✅ Pause recording (no glasses mic to fallback to)
- ✅ Resume when conflict clears

## Implementation

### 1. Audio Mode - Use MODE_NORMAL

```kotlin
// CRITICAL: Use MODE_NORMAL to avoid BT SCO activation
audioManager.mode = AudioManager.MODE_NORMAL
```

**Why:**

- `MODE_IN_CALL` and `MODE_IN_COMMUNICATION` both try to activate Bluetooth voice routing
- We don't want voice routing - we want natural audio routing
- Custom BLE mics are not part of the audio system

### 2. Audio Source - Use Clean Recording

```kotlin
// Use clean audio source (no processing)
val audioSource = if (Build.MANUFACTURER.equals("samsung", ignoreCase = true)) {
    MediaRecorder.AudioSource.VOICE_RECOGNITION  // Better cooperation on Samsung
} else {
    MediaRecorder.AudioSource.MIC  // Or CAMCORDER - both are clean
}
```

**Why:**

- `VOICE_COMMUNICATION` applies aggressive echo cancellation, noise suppression, AGC
- This processing degrades audio quality system-wide
- `MIC` or `CAMCORDER` give clean audio without processing
- `VOICE_RECOGNITION` on Samsung is more cooperative with other apps

### 3. Audio Focus - Use Transient Focus

```kotlin
val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)  // Better for always-on assistant
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    .setAudioAttributes(audioAttributes)
    .setOnAudioFocusChangeListener(focusListener, handler)
    .setAcceptsDelayedFocusGain(false)
    .build()

val result = audioManager.requestAudioFocus(focusRequest)
```

**Why:**

- `AUDIOFOCUS_GAIN_TRANSIENT` signals we need the mic temporarily
- Even though MentraOS runs all day, mic recording is intermittent
- This is more cooperative than `AUDIOFOCUS_GAIN` (permanent)
- `USAGE_ASSISTANCE_ACCESSIBILITY` signals always-on assistant behavior

### 4. Never Call startBluetoothSco()

```kotlin
// REMOVE THESE LINES:
// audioManager.startBluetoothSco()
// audioManager.isBluetoothScoOn = true

// NEVER activate SCO - let A2DP handle audio naturally
```

**Why:**

- SCO switches Bluetooth from A2DP (music) to HFP (call quality)
- All our mics are custom BLE or phone - no HFP mic needed
- Mentra Live needs A2DP output for high-quality audio

### 5. Audio Focus Strategy for Different Use Cases

**For Mic Recording (when actively recording):**

```kotlin
AUDIOFOCUS_GAIN_TRANSIENT
```

**For TTS Playback (quick notifications):**

```kotlin
AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK  // Music can continue quietly
```

**Never use:**

```kotlin
AUDIOFOCUS_GAIN  // Too aggressive for background app
```

## Code Changes Required

### PhoneMic.kt

#### Remove SCO Mode Entirely

```kotlin
// DELETE this entire function:
private fun startRecordingWithSco(): Boolean {
    // ... entire function
}
```

#### Update Normal Recording

```kotlin
private fun startRecordingNormal(): Boolean {
    try {
        // CRITICAL: Use MODE_NORMAL to avoid BT SCO activation
        audioManager.mode = AudioManager.MODE_NORMAL

        // Use clean audio source (no processing)
        val audioSource = if (isSamsungDevice()) {
            MediaRecorder.AudioSource.VOICE_RECOGNITION  // Better cooperation
        } else {
            MediaRecorder.AudioSource.MIC  // Clean audio
        }

        return createAndStartAudioRecord(audioSource)
    } catch (e: Exception) {
        Bridge.log("MIC: Normal recording failed: ${e.message}")
        return false
    }
}
```

#### Update startRecordingInternal

```kotlin
private fun startRecordingInternal(): Boolean {
    lastModeChangeTime = System.currentTimeMillis()

    // Check for conflicts
    if (isPhoneCallActive) {
        Bridge.log("MIC: Cannot start recording - phone call active")
        notifyCoreManager("phone_call_active", emptyList())
        return false
    }

    // Request audio focus
    if (!requestAudioFocus()) {
        Bridge.log("MIC: Failed to get audio focus")
        if (isSamsungDevice()) {
            testMicrophoneAvailabilityOnSamsung()
        } else {
            notifyCoreManager("audio_focus_denied", emptyList())
        }
        return false
    }

    // REMOVED: SCO mode logic - just use normal mode
    return startRecordingNormal()
}
```

#### Update Audio Focus Request

```kotlin
private fun requestAudioFocus(): Boolean {
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)  // Better for assistant
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()

        audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(audioAttributes)
            .setOnAudioFocusChangeListener(audioFocusListener!!, mainHandler)
            .setAcceptsDelayedFocusGain(false)
            .build()

        audioManager.requestAudioFocus(audioFocusRequest!!)
    } else {
        audioManager.requestAudioFocus(
            audioFocusListener,
            AudioManager.STREAM_VOICE_CALL,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
        )
    }

    hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
    return hasAudioFocus
}
```

#### Update stopRecording

```kotlin
fun stopRecording() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
        runBlocking { withContext(Dispatchers.Main) { stopRecording() } }
        return
    }

    if (!isRecording.get()) {
        return
    }

    Bridge.log("MIC: Stopping recording")

    // Clean up recording
    cleanUpRecording()

    // Abandon audio focus
    abandonAudioFocus()

    // REMOVED: SCO cleanup - we never activate it
    // audioManager.stopBluetoothSco()
    // audioManager.isBluetoothScoOn = false

    // Reset audio mode
    audioManager.mode = AudioManager.MODE_NORMAL

    // Notify CoreManager
    notifyCoreManager("recording_stopped", getAvailableInputDevices().values.toList())

    Bridge.log("MIC: Recording stopped")
}
```

## Testing Plan

### Test Cases

1. **G1 + Spotify**
   - Start MentraOS with G1 connected
   - Play Spotify
   - Verify: Spotify audio quality unchanged (high-quality stereo)
   - Activate voice command
   - Verify: Phone mic records cleanly, Spotify continues

2. **Z100 + YouTube**
   - Start MentraOS with Z100 connected
   - Play YouTube video
   - Verify: Video audio quality unchanged
   - Activate voice command
   - Verify: Phone mic records, video continues

3. **Mentra Live + Spotify**
   - Start MentraOS with Mentra Live connected
   - Play Spotify through Mentra Live
   - Verify: High-quality stereo audio through Mentra Live speakers
   - Activate voice command
   - Verify: Custom BLE mic captures audio, Spotify continues in high quality
   - Verify: Audio never switches to mono/call quality

4. **Mic Conflict Handling (G1)**
   - Start MentraOS with G1 (defaults to phone mic)
   - Verify: Using phone mic initially
   - Open another app that needs mic (Google Assistant, camera)
   - Verify: MentraOS switches to G1's custom BLE mic (fallback, lower quality)
   - Close other app
   - Verify: MentraOS switches back to phone mic (better quality)

5. **Background Recording**
   - Start MentraOS
   - Turn off screen
   - Activate voice command
   - Verify: Recording works with screen off
   - Verify: Other apps' audio unchanged

## Expected Results

After implementing these changes:

✅ **No more audio quality degradation** - Spotify/YouTube/etc. maintain high quality
✅ **Clean phone mic recording** - No system-wide audio processing
✅ **A2DP stays active** - Mentra Live continues high-quality music output
✅ **Proper mic sharing** - Releases phone mic when other apps need it
✅ **Works all day** - Runs persistently in background
✅ **Custom BLE mics work** - Independent of Android audio system

## Key Takeaways

1. **Never activate Bluetooth SCO** - We don't need HFP voice routing
2. **Use MODE_NORMAL** - Don't interfere with Bluetooth audio routing
3. **Use clean audio sources** - Avoid VOICE_COMMUNICATION processing
4. **Transient focus is fine** - Signals cooperative mic usage
5. **Custom BLE mics are our advantage** - They bypass Android audio conflicts

The fundamental mistake in both old and new code was treating our custom BLE mics like traditional Bluetooth headset mics. They're not. They're BLE GATT characteristics sending LC3 audio chunks, completely independent of Android's audio routing system.

By removing all Bluetooth SCO activation, we let A2DP handle high-quality music output while cleanly recording from phone mic (or custom BLE mic) without system-wide interference.

---

## Extended Solution: Supporting Multiple Mic Sources

### The Accessibility Requirement

Some users are Deaf or Hard of Hearing and use MentraOS for live captions. They often use **external Bluetooth lapel microphones** for better audio quality than phone mics. These are traditional HFP Bluetooth devices that require SCO activation.

**Key insight**: Audio output degradation doesn't matter for Deaf/HoH users - they're not listening to music. SCO activation is acceptable for this use case.

### Mic Source Options

We need to support four microphone source options with intelligent fallback chains:

#### Fallback Chain Hierarchy

The complete fallback cascade (most restrictive → most accessible):

```
Bluetooth mic → Phone mic → Glasses mic (if available)
Phone mic → Glasses mic (if available)
Glasses mic → (no fallback - always accessible if hardware exists)
```

**Key principle:** Glasses mic is the ultimate fallback because if the hardware exists, we can always access it (LC3 over GATT, independent of Android audio system).

---

#### 1. **Automatic [RECOMMENDED]** - Default

- System automatically selects best mic for connected glasses based on hardware capabilities
- Follows the normal fallback chain for the selected default
- **For G1**:
  - Default: Phone mic
  - Fallback: G1's LC3 mic (if phone mic conflicts with other app)
- **For Z100**:
  - Default: Phone mic
  - Fallback: None (no glasses mic) - pauses recording on conflict
- **For Mentra Live**:
  - Default: Glasses LC3 mic
  - Fallback: None needed (always accessible)
- Zero configuration, just works

#### 2. **Phone mic (auto-switch if needed)**

- Primary: Phone microphone
- Fallback chain: **Phone mic → Glasses mic** (if available)
- Behavior:
  - Uses phone mic by default
  - On conflict (another app needs mic): switches to glasses LC3 mic if available
  - If no glasses mic available (Z100): pauses recording until conflict clears
- Clean audio, no SCO activation

#### 3. **Glasses mic only**

- Primary: Glasses' custom LC3 microphone exclusively
- Fallback: **None** (always accessible if hardware exists)
- Availability:
  - **G1**: Available (forces use of G1's mic even though quality is lower)
  - **Mentra Live**: Available (good quality glasses mic)
  - **Z100**: **Not available** - option disabled in UI (no onboard mic)
- Never uses phone mic or external BT mic
- Clean audio, no SCO activation
- If glasses don't have mic: show error in UI, disable option

#### 4. **Bluetooth microphone (for lapel mics)**

- Primary: External Bluetooth lapel microphone (HFP device)
- Fallback chain: **Bluetooth mic → Phone mic → Glasses mic** (if available)
- Behavior:
  - Attempts to activate Bluetooth SCO for HFP audio
  - If no BT mic connected: falls back to phone mic silently
  - If phone mic conflicts: falls back to glasses mic (if available)
  - If no glasses mic: pauses (Z100 case)
- Activates SCO when BT mic active - degrades audio output to mono 16kHz
- Manual selection for Deaf/HoH users
- Clear warning about audio quality impact when SCO is active

### Settings UI

#### UI Layout

```
┌─────────────────────────────────────────────────┐
│ Microphone Source                               │
│                                                 │
│ ⦿ Automatic [RECOMMENDED]                       │
│   Best microphone for your glasses              │
│                                                 │
│ ○ Phone mic (auto-switch if needed)             │
│   Phone mic, falls back to glasses if needed    │
│                                                 │
│ ○ Glasses mic only                              │
│   Always use microphone in your glasses         │
│   (Not available for Z100)                      │
│                                                 │
│ ○ Bluetooth microphone                          │
│   External Bluetooth lapel microphone           │
│   ⚠ May reduce music quality in other apps      │
└─────────────────────────────────────────────────┘

ⓘ Most users should use "Automatic" mode.
  Bluetooth microphone is for external lapel mics
  (not your glasses' microphone).
```

#### UI State Management

**Persisting User Selection:**

- Store user's manual selection in preferences
- If user selects anything other than "Automatic", respect that choice across glasses changes
- If user has never made a selection, default to "Automatic"

**Dynamic Option Availability:**

- **Glasses mic only**:
  - Enabled: G1, Mentra Live
  - Disabled (grayed out): Z100 (with tooltip: "Your glasses don't have an onboard microphone")
- All other options: Always available

**When Glasses Change:**

```typescript
// User has manually selected "Phone mic"
// Then switches from G1 → Mentra Live
// Result: Keep "Phone mic" (respect user's choice)

// User has "Automatic" selected
// Then switches from G1 → Mentra Live
// Result: Keep "Automatic", but behavior changes (G1: phone → Mentra Live: glasses)
```

### Implementation Architecture

#### TypeScript Capabilities Extension

First, extend the TypeScript `Capabilities` interface to include recommended mic source:

```typescript
// cloud/packages/types/src/hardware.ts
export interface Capabilities {
  modelName: string
  hasCamera: boolean
  // ... existing fields

  // NEW: Recommended microphone configuration
  recommendedMicSource?: "phone_auto_switch" | "glasses_only"
}
```

Update each glasses capability file:

```typescript
// cloud/packages/types/src/capabilities/even-realities-g1.ts
export const evenRealitiesG1: Capabilities = {
  modelName: "Even Realities G1",
  hasMicrophone: true,
  microphone: {
    count: 1,
    hasVAD: false,
  },
  recommendedMicSource: "phone_auto_switch", // Phone with fallback to G1 mic
  // ... rest
}
```

```typescript
// cloud/packages/types/src/capabilities/mentra-live.ts
export const mentraLive: Capabilities = {
  modelName: "Mentra Live",
  hasMicrophone: true,
  hasSpeaker: true,
  recommendedMicSource: "glasses_only", // Use glasses mic directly
  // ... rest
}
```

```typescript
// cloud/packages/types/src/capabilities/vuzix-z100.ts
export const vuzixZ100: Capabilities = {
  modelName: "Vuzix Z100",
  hasMicrophone: false,
  recommendedMicSource: "phone_auto_switch", // Phone only (no glasses mic to fall back to)
  // ... rest
}
```

#### React Native Bridge

When glasses connect, pass the recommended mic source to native via existing `updateSettings`:

```typescript
// mobile/src/wherever-glasses-connect.ts
import {getModelCapabilities} from "@/../../cloud/packages/types/src/hardware"

async function onGlassesConnected(glassesType: string) {
  const capabilities = getModelCapabilities(glassesType as DeviceTypes)

  // Only update if user hasn't manually selected a mic source
  const userSelection = await AsyncStorage.getItem("mic_source_override")
  if (!userSelection) {
    await Core.updateSettings({
      preferred_mic: capabilities.recommendedMicSource || "automatic",
    })
  }
}
```

#### Android Native - Mic Source Enum

```kotlin
// mobile/modules/core/android/src/main/java/com/mentra/core/services/MicSource.kt
package com.mentra.core.services

enum class MicSource {
    AUTOMATIC,            // Auto-select best for glasses [DEFAULT]
    PHONE_AUTO_SWITCH,    // Phone mic with auto-switch to glasses BLE mic
    GLASSES_ONLY,         // Glasses BLE mic only
    BLUETOOTH_MIC;        // External BT HFP mic (lapel mics for Deaf/HoH)

    companion object {
        fun fromString(value: String): MicSource {
            return when (value.lowercase()) {
                "automatic" -> AUTOMATIC
                "phone_auto_switch", "phone" -> PHONE_AUTO_SWITCH
                "glasses_only", "glasses" -> GLASSES_ONLY
                "bluetooth_mic", "bluetooth" -> BLUETOOTH_MIC
                else -> AUTOMATIC
            }
        }
    }
}
```

#### Use Existing Glasses Capabilities System

Instead of creating a new `GlassesType` enum, use the existing shared type system between cloud and mobile:

```kotlin
// Assuming existing glasses capabilities system
data class GlassesCapabilities(
    val deviceModelName: String,
    val hasDisplay: Boolean,
    val hasSpeakers: Boolean,
    val hasCustomBLEMic: Boolean,  // G1=true (poor quality), Mentra Live=true (good quality), Z100=false
    val hasCamera: Boolean,
    // ... other capabilities
)

// Add method to get default mic source based on capabilities
fun GlassesCapabilities.getDefaultMicSource(): MicSource {
    return when {
        // Mentra Live: Has speakers + good custom mic = prefer glasses only
        hasSpeakers && hasCustomBLEMic -> MicSource.GLASSES_ONLY

        // G1: Has custom mic but quality is poor = phone with auto-switch to glasses as fallback
        hasCustomBLEMic && !hasSpeakers -> MicSource.PHONE_AUTO_SWITCH

        // Z100: No custom mic = phone only (no fallback available)
        !hasCustomBLEMic -> MicSource.PHONE_AUTO_SWITCH

        // Default fallback
        else -> MicSource.PHONE_AUTO_SWITCH
    }
}

// Store in capabilities object
fun GlassesCapabilities.getRecommendedMicConfig(): MicConfig {
    val defaultSource = getDefaultMicSource()
    return MicConfig(
        source = defaultSource,
        needsSCO = false,
        audioMode = AudioManager.MODE_NORMAL,
        audioSource = if (isSamsungDevice()) {
            MediaRecorder.AudioSource.VOICE_RECOGNITION
        } else {
            MediaRecorder.AudioSource.MIC
        },
        focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
    )
}
```

#### MicSourceManager Integration

```kotlin
// mobile/modules/core/android/src/main/java/com/mentra/core/services/MicSourceManager.kt
package com.mentra.core.services

import android.content.Context
import android.media.AudioManager
import android.media.MediaRecorder
import android.os.Build
import com.mentra.core.Bridge
import com.mentra.core.CoreManager

class MicSourceManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("mic_prefs", Context.MODE_PRIVATE)

    data class MicConfig(
        val source: MicSource,
        val useBLEMic: Boolean,        // Use glasses LC3 mic over GATT
        val usePhoneMic: Boolean,      // Use phone AudioRecord
        val activateSCO: Boolean,      // Activate Bluetooth SCO for HFP
        val audioMode: Int,
        val audioSource: Int,          // For AudioRecord (-1 if using BLE mic)
        val focusGain: Int,
        val canFallbackToGlasses: Boolean,  // Can fallback to glasses mic
        val canFallbackToPhone: Boolean     // Can fallback to phone mic
    )

    /**
     * Get microphone configuration for the selected source
     * Handles automatic resolution and fallback chains
     */
    fun getMicConfig(selectedSource: MicSource): MicConfig {
        val glassesHasMic = CoreManager.getInstance().sgc?.hasMic ?: false

        return when (selectedSource) {
            MicSource.AUTOMATIC -> {
                // Resolve based on current glasses type
                val resolvedSource = resolveAutomaticSource()
                getMicConfig(resolvedSource)
            }

            MicSource.PHONE_AUTO_SWITCH -> MicConfig(
                source = selectedSource,
                useBLEMic = false,
                usePhoneMic = true,
                activateSCO = false,
                audioMode = AudioManager.MODE_NORMAL,
                audioSource = if (isSamsungDevice()) {
                    MediaRecorder.AudioSource.VOICE_RECOGNITION
                } else {
                    MediaRecorder.AudioSource.MIC
                },
                focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                canFallbackToGlasses = glassesHasMic,  // Can fallback if glasses has mic
                canFallbackToPhone = false             // Already on phone
            )

            MicSource.GLASSES_ONLY -> {
                if (!glassesHasMic) {
                    // Z100 case - no glasses mic available
                    Bridge.log("MIC: Glasses mic not available for this model")
                    // Should be prevented in UI, but handle gracefully
                    return getMicConfig(MicSource.PHONE_AUTO_SWITCH)
                }

                MicConfig(
                    source = selectedSource,
                    useBLEMic = true,
                    usePhoneMic = false,
                    activateSCO = false,
                    audioMode = AudioManager.MODE_NORMAL,
                    audioSource = -1, // N/A - using BLE mic
                    focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                    canFallbackToGlasses = false,  // Already on glasses
                    canFallbackToPhone = false     // Glasses-only mode
                )
            }

            MicSource.BLUETOOTH_MIC -> MicConfig(
                source = selectedSource,
                useBLEMic = false,
                usePhoneMic = false,  // Start with BT, will fallback to phone if needed
                activateSCO = true,   // Try to activate SCO for HFP
                audioMode = AudioManager.MODE_IN_COMMUNICATION,
                audioSource = MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                focusGain = AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
                canFallbackToGlasses = glassesHasMic,  // Ultimate fallback if glasses has mic
                canFallbackToPhone = true              // Immediate fallback if no BT device
            )
        }
    }

    /**
     * Resolve "Automatic" to actual mic source based on current glasses
     */
    private fun resolveAutomaticSource(): MicSource {
        val sgc = CoreManager.getInstance().sgc
        val deviceType = sgc?.type ?: return MicSource.PHONE_AUTO_SWITCH

        return when (deviceType) {
            "Mentra Live" -> MicSource.GLASSES_ONLY
            "Even Realities G1" -> MicSource.PHONE_AUTO_SWITCH
            "Vuzix Z100" -> MicSource.PHONE_AUTO_SWITCH
            else -> MicSource.PHONE_AUTO_SWITCH
        }
    }

    fun getCurrentMicSource(): MicSource {
        val stored = prefs.getString("mic_source_override", "automatic") ?: "automatic"
        return MicSource.fromString(stored)
    }

    fun setMicSourceOverride(source: MicSource) {
        val value = when (source) {
            MicSource.AUTOMATIC -> "automatic"
            MicSource.PHONE_AUTO_SWITCH -> "phone_auto_switch"
            MicSource.GLASSES_ONLY -> "glasses_only"
            MicSource.BLUETOOTH_MIC -> "bluetooth_mic"
        }
        prefs.edit().putString("mic_source_override", value).apply()
    }

    fun clearMicSourceOverride() {
        prefs.edit().remove("mic_source_override").apply()
    }

    private fun isSamsungDevice(): Boolean {
        return Build.MANUFACTURER.equals("samsung", ignoreCase = true)
    }
}
```

#### Updated PhoneMic.kt Integration

```kotlin
class PhoneMic(
    private val context: Context,
    private val glassesCapabilities: GlassesCapabilities
) {
    private val micSourceManager = MicSourceManager(context, glassesCapabilities)

    fun startRecording(): Boolean {
        val selectedSource = micSourceManager.getCurrentMicSource()
        val config = micSourceManager.getMicConfig(selectedSource)

        Bridge.log("MIC: Starting recording with source: ${config.source}")

        return when {
            config.source == MicSource.GLASSES_ONLY -> {
                // Use custom BLE mic - notify CoreManager to enable it
                audioManager.mode = AudioManager.MODE_NORMAL
                notifyCoreManager("enable_glasses_mic", emptyList())
                true
            }

            config.needsSCO -> {
                // External Bluetooth mic - activate SCO
                Bridge.log("MIC: ⚠️ Activating Bluetooth SCO for external lapel mic")
                startRecordingWithBluetooth(config)
            }

            else -> {
                // Phone mic - no SCO (99% of users)
                startRecordingWithPhone(config)
            }
        }
    }

    private fun startRecordingWithPhone(config: MicConfig): Boolean {
        audioManager.mode = config.audioMode  // MODE_NORMAL

        if (!requestAudioFocus(config.focusGain)) {
            Bridge.log("MIC: Failed to get audio focus")
            return false
        }

        return createAndStartAudioRecord(config.audioSource)
    }

    private fun startRecordingWithBluetooth(config: MicConfig): Boolean {
        audioManager.mode = config.audioMode  // MODE_IN_COMMUNICATION
        audioManager.startBluetoothSco()

        // Wait for SCO connection (implement async wait)
        // ...

        if (!requestAudioFocus(config.focusGain)) {
            Bridge.log("MIC: Failed to get audio focus")
            audioManager.stopBluetoothSco()
            return false
        }

        return createAndStartAudioRecord(config.audioSource)
    }

    // Conflict handling with proper fallback chain
    private fun handleMicConflict() {
        val currentSource = micSourceManager.getCurrentMicSource()
        val config = micSourceManager.getMicConfig(currentSource)

        when {
            // Currently on phone mic → try fallback to glasses
            config.usePhoneMic && config.canFallbackToGlasses -> {
                Bridge.log("MIC: Phone mic conflict - switching to glasses mic")
                switchToGlassesMic()
            }

            // Currently on BT mic → fallback to phone (which can then fallback to glasses)
            config.activateSCO && config.canFallbackToPhone -> {
                Bridge.log("MIC: Bluetooth mic conflict - falling back to phone mic")
                switchToPhoneMic(canFallbackToGlasses = config.canFallbackToGlasses)
            }

            // Already on glasses mic or no fallback available → pause
            else -> {
                Bridge.log("MIC: Conflict detected - no fallback available, pausing")
                stopRecording()
                notifyCoreManager("mic_conflict_pause", emptyList())
            }
        }
    }

    private fun switchToGlassesMic() {
        stopRecording()
        // Enable glasses mic via CoreManager
        notifyCoreManager("enable_glasses_mic", emptyList())
    }

    private fun switchToPhoneMic(canFallbackToGlasses: Boolean) {
        // Deactivate SCO if it was active
        if (audioManager.isBluetoothScoOn) {
            audioManager.stopBluetoothSco()
            audioManager.mode = AudioManager.MODE_NORMAL
        }

        // Restart with phone mic config
        val phoneMicConfig = micSourceManager.getMicConfig(MicSource.PHONE_AUTO_SWITCH)
        stopRecording()
        startRecordingWithPhone(phoneMicConfig)
    }
}
```

### Fallback Behavior by Glasses Type and Mic Source

| Glasses         | Mic Source          | Primary          | 1st Fallback      | 2nd Fallback      | Final State        |
| --------------- | ------------------- | ---------------- | ----------------- | ----------------- | ------------------ |
| **G1**          | Automatic           | Phone mic        | → G1 LC3 mic      | -                 | Works              |
| **G1**          | Phone (auto-switch) | Phone mic        | → G1 LC3 mic      | -                 | Works              |
| **G1**          | Glasses only        | G1 LC3 mic       | -                 | -                 | Works              |
| **G1**          | Bluetooth mic       | BT HFP mic       | → Phone mic       | → G1 LC3 mic      | Works              |
| **Z100**        | Automatic           | Phone mic        | -                 | -                 | Pauses on conflict |
| **Z100**        | Phone (auto-switch) | Phone mic        | -                 | -                 | Pauses on conflict |
| **Z100**        | Glasses only        | _Disabled in UI_ | -                 | -                 | -                  |
| **Z100**        | Bluetooth mic       | BT HFP mic       | → Phone mic       | -                 | Pauses on conflict |
| **Mentra Live** | Automatic           | Mentra Live mic  | -                 | -                 | Works              |
| **Mentra Live** | Phone (auto-switch) | Phone mic        | → Mentra Live mic | -                 | Works              |
| **Mentra Live** | Glasses only        | Mentra Live mic  | -                 | -                 | Works              |
| **Mentra Live** | Bluetooth mic       | BT HFP mic       | → Phone mic       | → Mentra Live mic | Works              |

**Key Insights:**

- ✅ G1 and Mentra Live always have a working fallback path
- ⚠️ Z100 pauses when phone mic conflicts (no glasses mic available)
- 🎯 Automatic mode picks the best default per glasses type
- 🔗 Bluetooth mic has the longest fallback chain (BT → Phone → Glasses)

### Migration Plan

#### Phase 1: Add New Mic Options (Non-Breaking)

```kotlin
// Update settings to show 4 options
// Default all users to AUTOMATIC
if (!prefs.contains("mic_source_override")) {
    // First launch - set to AUTOMATIC
    micSourceManager.setMicSourceOverride(MicSource.AUTOMATIC)
}
```

#### Phase 2: Migrate Existing Preferences

```kotlin
// Migrate from old 2-option system to new 4-option system
if (!prefs.contains("migrated_to_v3")) {
    val oldPref = prefs.getString("mic_source", null)
    when (oldPref) {
        "phone" -> {
            // Was using phone - map to PHONE_AUTO_SWITCH
            micSourceManager.setMicSourceOverride(MicSource.PHONE_AUTO_SWITCH)
        }
        "glasses" -> {
            // Was using glasses - map to GLASSES_ONLY
            micSourceManager.setMicSourceOverride(MicSource.GLASSES_ONLY)
        }
        null -> {
            // No preference set - use AUTOMATIC
            micSourceManager.setMicSourceOverride(MicSource.AUTOMATIC)
        }
    }
    prefs.edit().putBoolean("migrated_to_v3", true).apply()
}
```

### Testing Plan - Extended

#### 6. **Deaf/HoH User with External Lapel Mic**

- Connect external Bluetooth lapel microphone
- Select "Bluetooth microphone" in settings
- Start MentraOS live captions
- Verify: External lapel mic works correctly
- Verify: Audio output degraded (expected - user is Deaf/HoH, doesn't care)
- Play music in background
- Verify: Music becomes mono 16kHz (expected - SCO is active)

#### 7. **Automatic Mode - G1**

- Connect G1 glasses
- Settings should default to "Automatic [RECOMMENDED]"
- Verify: Uses phone mic by default (better quality)
- Open Google Assistant (mic conflict)
- Verify: Automatically switches to G1 LC3 mic (fallback, lower quality but works)
- Close Google Assistant
- Verify: Switches back to phone mic (restore better quality)

#### 8. **Automatic Mode - Z100**

- Connect Z100 glasses
- Settings should default to "Automatic [RECOMMENDED]"
- Verify: Uses phone mic by default
- Open Google Assistant (mic conflict)
- Verify: Pauses recording (no glasses mic to switch to)
- Close Google Assistant
- Verify: Resumes with phone mic

#### 9. **Automatic Mode - Mentra Live**

- Connect Mentra Live glasses
- Settings should default to "Automatic [RECOMMENDED]"
- Verify: Uses Mentra Live LC3 mic by default (good quality)
- Verify: Never uses phone mic
- Play Spotify through Mentra Live
- Verify: High-quality stereo maintained

### UI Strings

```kotlin
object MicSourceStrings {
    const val AUTOMATIC_TITLE = "Automatic [RECOMMENDED]"
    const val AUTOMATIC_DESC = "Best microphone for your glasses"

    const val PHONE_TITLE = "Phone mic (auto-switch if needed)"
    const val PHONE_DESC = "Phone mic, falls back to glasses if needed"

    const val GLASSES_TITLE = "Glasses mic only"
    const val GLASSES_DESC = "Always use microphone in your glasses"
    const val GLASSES_UNAVAILABLE = "(Not available for your glasses)"

    const val BLUETOOTH_TITLE = "Bluetooth microphone"
    const val BLUETOOTH_DESC = "External Bluetooth lapel microphone"
    const val BLUETOOTH_WARNING = "⚠️ May reduce music quality in other apps"

    const val INFO_TEXT = """
        Most users should use "Automatic" mode.

        Bluetooth microphone is for external lapel mics
        (not your glasses' microphone).
    """.trimIndent()
}
```

### Benefits Summary

#### For 99% of Users (Hearing)

✅ **Default "Automatic" mode** - Zero configuration, just works
✅ **Per-glasses defaults** - G1 uses phone (fallback to G1 mic), Z100 uses phone, Mentra Live uses glasses
✅ **No audio degradation** - Never activates SCO by default
✅ **Smart auto-switching** - G1 switches to glasses mic on conflict (Z100 pauses, Mentra Live already on glasses)
✅ **Clean separation** - Each mic source has clear behavior

#### For Deaf/HoH Users

✅ **External lapel mic support** - Properly works via SCO
✅ **Manual opt-in** - Clear "Bluetooth microphone" option
✅ **Clear warnings** - UI explains audio quality impact (doesn't matter to them)
✅ **Accessible** - Live captions work with best mic quality

#### For Developers

✅ **Uses existing types** - No new GlassesType enum, uses shared capabilities system
✅ **Clean architecture** - MicSourceManager encapsulates all logic
✅ **Easy to extend** - Add new glasses by updating capabilities
✅ **Testable** - Each path is independent and well-defined
