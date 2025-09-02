package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos;

import android.content.Context;
import android.util.Log;

import com.augmentos.augmentos_core.augmentos_backend.ServerComms;
import com.augmentos.augmentos_core.enums.SpeechRequiredDataType;
import com.augmentos.augmentos_core.smarterglassesmanager.SmartGlassesManager;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.AsrStreamKey;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.SpeechRecFramework;
import com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.vad.VadGateSpeechPolicy;
import com.augmentos.augmentoslib.events.SpeechRecOutputEvent;
import com.augmentos.augmentoslib.events.TranslateOutputEvent;

import org.greenrobot.eventbus.EventBus;
import org.json.JSONObject;

import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * SpeechRecAugmentos uses ServerComms for WebSocket interactions (single connection).
 * This class retains all VAD logic, EventBus usage, and rolling buffer logic.
 * It calls into ServerComms to send audio data, VAD status, etc.
 */
public class SpeechRecAugmentos extends SpeechRecFramework {
    private static final String TAG = "WearableAi_SpeechRecAugmentos";
    private static SpeechRecAugmentos instance;

    private final Context mContext;
    private final int bufferMaxSize;

    // VAD
    private VadGateSpeechPolicy vadPolicy;
    private volatile boolean isSpeaking = false; // Track VAD state

    // VAD buffer for chunking
    private BlockingQueue<Short> vadBuffer = new LinkedBlockingQueue<>();
    private final int vadFrameSize = 512; // 512-sample frames for VAD
    private volatile boolean vadRunning = true;
    private boolean bypassVadForDebugging = false;
    private boolean bypassVadForPCM = false; // NEW: PCM subscription bypass
    private boolean enforceLocalTranscription = false;

    // LC3 audio rolling buffer
    private final ArrayList<byte[]> lc3RollingBuffer = new ArrayList<>();
    private final int LC3_BUFFER_MAX_SIZE = 22; // ~220ms of audio at 10ms per LC3 frame

    // Sherpa ONNX Transcriber
    private SherpaOnnxTranscriber sherpaTranscriber;
    
    // Backend data sending control flags
    private volatile boolean sendPcmToBackend = true;
    private volatile boolean sendTranscriptionToBackend = false;
    public boolean sendRawPCMToBackend = true;
    private List<SpeechRequiredDataType> currentRequiredData = new ArrayList<>();

    private SpeechRecAugmentos(Context context) {
        this.mContext = context;

        // 1) Create or fetch your single ServerComms (the new consolidated manager).
        //    For example, we create a new instance here:

        // 2) Let ServerComms know it should forward "interim"/"final" messages to this class.
        ServerComms.getInstance().setSpeechRecAugmentos(this);

        // Rolling buffer to store ~220ms of audio for replay on VAD trigger
        this.bufferMaxSize = (int) ((16000 * 0.22 * 2) / 512);

        bypassVadForDebugging = SmartGlassesManager.getBypassVadForDebugging(context);

        // Initialize VAD asynchronously
        initVadAsync();
        
        // Initialize Sherpa ONNX Transcriber
        initSherpaTranscriber();
    }

    public void restartTranscriber() {
        new Thread(() -> {
            try {
                sherpaTranscriber.restart();
                Log.d(TAG, "Sherpa-ONNX transcriber restarted successfully");
            } catch (Exception e) {
                Log.e(TAG, "Error restarting Sherpa-ONNX transcriber", e);
            }}, "SpeechRecAugmentos_restartAsync").start();
    }

    /**
     * Initialize Sherpa ONNX Transcriber and set up the listener
     */
    private void initSherpaTranscriber() {
        sherpaTranscriber = new SherpaOnnxTranscriber(mContext);
        
        // Session start time for relative timestamps
        final long transcriptionSessionStart = System.currentTimeMillis();
        
        sherpaTranscriber.setTranscriptListener(new SherpaOnnxTranscriber.TranscriptListener() {
            @Override
            public void onPartialResult(String text) {
                sendFormattedTranscriptionToBackend(text, false, transcriptionSessionStart);
            }

            @Override
            public void onFinalResult(String text) {
                sendFormattedTranscriptionToBackend(text, true, transcriptionSessionStart);
            }
        });
        
        // Initialize the transcriber on a background thread
        new Thread(() -> {
            try {
                sherpaTranscriber.init();
                Log.d(TAG, "Sherpa ONNX transcriber initialized successfully");
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize Sherpa ONNX transcriber", e);
            }
        }, "SpeechRecAugmentos_initSherpaAsync").start();
    }
    
    /**
     * Helper method to format transcription as JSON and send to backend
     * 
     * @param text The transcription text
     * @param isFinal Whether this is a final result
     * @param sessionStartTime Session start time for relative timestamp calculation
     */
    private void sendFormattedTranscriptionToBackend(String text, boolean isFinal, long sessionStartTime) {
        try {
            JSONObject transcription = new JSONObject();
            transcription.put("type", "local_transcription");
            transcription.put("text", text);
            transcription.put("isFinal", isFinal);
            
            // Calculate relative timestamps
            long currentTime = System.currentTimeMillis();
            long relativeTime = currentTime - sessionStartTime;
            

            // TODO: This is wrong
            // Instead we should have some timer inside sherpa that is reset on every final result.
            // Also I don't think we need speaker id as there is no diarization.

            int timeOffset = isFinal ? 2000 : 1000;
            transcription.put("startTime", relativeTime - timeOffset);
            transcription.put("endTime", relativeTime);
            
            // Add metadata
            transcription.put("speakerId", 0);
            transcription.put("transcribeLanguage", "en-US");
            transcription.put("provider", "sherpa-onnx");
            
            // Send the JSON to ServerComms
            ServerComms.getInstance().sendTranscriptionResult(transcription);
            
            Log.d(TAG, "Sent " + (isFinal ? "final" : "partial") + " transcription: " + text);
        } catch (org.json.JSONException e) {
            Log.e(TAG, "Error creating transcription JSON: " + e.getMessage(), e);
        }
    }

    /**
     * Initializes the VAD model on a background thread, then sets up the VAD logic.
     */
    private void initVadAsync() {
        new Thread(() -> {
            vadPolicy = new VadGateSpeechPolicy(mContext);
            vadPolicy.init(512);
            setupVadListener();
            startVadProcessingThread();
        }, "1SpeechRecAugmentos_initVadAsync").start();
    }

    /**
     * Sets up a loop that checks VAD state and sends VAD on/off to the server.
     */
    private void setupVadListener() {
        new Thread(() -> {
            boolean previousVadState = false;

            while (true) {
                try {
                    // Get current VAD state
                    boolean newVadIsSpeakingState = vadPolicy.shouldPassAudioToRecognizer();

                    // Only take action when state changes
                    if (newVadIsSpeakingState != previousVadState) {
                        if (newVadIsSpeakingState) {
                            // VAD on
                            sendVadStatus(true);
                            sendBufferedAudio();
                            isSpeaking = true;
                        } else {
                            // VAD off
                            sendVadStatus(false);
                            isSpeaking = false;
                        }
                        previousVadState = newVadIsSpeakingState;
                    }

                    // Use longer sleep time to reduce CPU usage
                    // WAS PREVIOUSLY 50
                    Thread.sleep(100);

                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }, "2SpeechRecAugmentos_setupVadListener").start();
    }

    /**
     * Drains the rolling buffer (last ~220ms) and sends it immediately when VAD opens.
     */
    private void sendBufferedAudio() {
        List<byte[]> bufferToSend;

        synchronized (lc3RollingBuffer) {
            bufferToSend = new ArrayList<>(lc3RollingBuffer);
        }

        if (bufferToSend.isEmpty()) {
            Log.d(TAG, "No buffered LC3 chunks to send.");
            return;
        }

        for (byte[] chunk : bufferToSend) {
            // Now we send audio chunks through ServerComms (single WebSocket).
            ServerComms.getInstance().sendAudioChunk(chunk);
        }

        Log.d(TAG, "Sent " + bufferToSend.size() + " buffered LC3 chunks to server.");
    }

    /**
     * Start a background thread that chunks up audio for VAD (512 frames).
     */
    private void startVadProcessingThread() {
        // Convert to a BlockingQueue
        BlockingQueue<Short> vadBlockingQueue = new LinkedBlockingQueue<>();

        // Replace your existing queue with this one
        this.vadBuffer = vadBlockingQueue;

        new Thread(() -> {
            short[] vadChunk = new short[vadFrameSize];
            int bufferedSamples = 0;

            while (vadRunning) {
                try {
                    // Use take() to efficiently block until data is available
                    // WAS PREVIOUSLY 5
                    Short sample = vadBlockingQueue.poll(50, TimeUnit.MILLISECONDS);

                    // If we got a sample, add it to our chunk
                    if (sample != null) {
                        vadChunk[bufferedSamples++] = sample;

                        // If we've filled the chunk, process it
                        if (bufferedSamples == vadFrameSize) {
                            byte[] bytes = shortsToBytes(vadChunk);
                            vadPolicy.processAudioBytes(bytes, 0, bytes.length);
                            bufferedSamples = 0;
                        }
                    }
                    // If poll times out, just continue the loop
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }, "3SpeechRecAugmentos_startVadProcessingThread").start();
    }

    /**
     * Tells the server whether VAD is "speaking" or not.
     */
    private void sendVadStatus(boolean isNowSpeaking) {
        ServerComms.getInstance().sendVadStatus(isNowSpeaking);
    }

    /**
     * Called by external code to feed raw PCM chunks (16-bit, 16kHz).
     * runs VAD on decoded data to tell whether or not we should send the encoded data to the backend
     */
    @Override
    public void ingestAudioChunk(byte[] audioChunk) {
        //VAD STUFF
        if (vadPolicy == null) {
            Log.e(TAG, "VAD not initialized yet. Skipping audio.");
            return;
        }
        if (!isVadInitialized()) {
            Log.e(TAG, "VAD model not initialized. Skipping audio.");
            return;
        }
        short[] audioSamples = bytesToShort(audioChunk);
        for (short sample : audioSamples) {
            if (vadBuffer.size() >= 16000) {
                vadBuffer.poll();
            }
            vadBuffer.offer(sample);
        }

        // Log.d(TAG, "Sending PCM audio chunk to backend");


        if (sendRawPCMToBackend) {
            //BUFFER STUFF
            // Add to rolling buffer regardless of VAD state
            synchronized (lc3RollingBuffer) {
                // Clone the data to ensure we have our own copy
                byte[] copy = new byte[audioChunk.length];
                System.arraycopy(audioChunk, 0, copy, 0, audioChunk.length);

                lc3RollingBuffer.add(copy);
                while (lc3RollingBuffer.size() > LC3_BUFFER_MAX_SIZE) {
                    lc3RollingBuffer.remove(0); // Remove oldest chunks to maintain rolling window
                }
            }
            //SENDING STUFF
            // If bypassing VAD for debugging, PCM subscription, or currently speaking, send data live
            if (sendPcmToBackend && (bypassVadForDebugging || bypassVadForPCM || isSpeaking)) {
                // if (bypassVadForDebugging || bypassVadForPCM) {
                //     Log.d(TAG, "Sending audio due to VAD bypass - bypassVadForDebugging=" + bypassVadForDebugging + 
                //               ", bypassVadForPCM=" + bypassVadForPCM + ", isSpeaking=" + isSpeaking);
                // }
                ServerComms.getInstance().sendAudioChunk(audioChunk);
            }
        }

        if (sendTranscriptionToBackend && (bypassVadForDebugging || bypassVadForPCM || isSpeaking)) {
            if (sherpaTranscriber != null) {
                sherpaTranscriber.acceptAudio(audioChunk);
            }
        }
    }

    /**
     * Called by external code to feed raw LC3 chunks
     */
    @Override
    public void ingestLC3AudioChunk(byte[] LC3audioChunk) {
        if (!sendRawPCMToBackend) {
            //BUFFER STUFF
            // Add to rolling buffer regardless of VAD state
            synchronized (lc3RollingBuffer) {
                // Clone the data to ensure we have our own copy
                byte[] copy = new byte[LC3audioChunk.length];
                System.arraycopy(LC3audioChunk, 0, copy, 0, LC3audioChunk.length);

                lc3RollingBuffer.add(copy);
                while (lc3RollingBuffer.size() > LC3_BUFFER_MAX_SIZE) {
                    lc3RollingBuffer.remove(0); // Remove oldest chunks to maintain rolling window
                }
            }

            //SENDING STUFF
            // If bypassing VAD for debugging, PCM subscription, or currently speaking, send data live
            if (bypassVadForDebugging || bypassVadForPCM || isSpeaking) {
                if (bypassVadForDebugging || bypassVadForPCM) {
                    Log.d(TAG, "Sending LC3 audio due to VAD bypass - bypassVadForDebugging=" + bypassVadForDebugging + 
                              ", bypassVadForPCM=" + bypassVadForPCM + ", isSpeaking=" + isSpeaking);
                }
                ServerComms.getInstance().sendAudioChunk(LC3audioChunk);
            }

            // NOTE (yash): Not adding transcription code here because this is legacy code. 
        }
    }

    /**
     * Converts short[] -> byte[] (little-endian)
     */
    private byte[] shortsToBytes(short[] shorts) {
        ByteBuffer byteBuffer = ByteBuffer.allocate(shorts.length * 2);
        byteBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(shorts);
        return byteBuffer.array();
    }

    /**
     * Converts byte[] -> short[] (little-endian)
     */
    private short[] bytesToShort(byte[] bytes) {
        short[] shorts = new short[bytes.length / 2];
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().get(shorts);
        return shorts;
    }

    /**
     * Simple reflection-based check to see if the VAD model is loaded.
     */
    private boolean isVadInitialized() {
        try {
            Field vadField = vadPolicy.getClass().getDeclaredField("vad");
            vadField.setAccessible(true);
            Object vadInstance = vadField.get(vadPolicy);
            return vadInstance != null;
        } catch (Exception e) {
            Log.e(TAG, "Failed to check VAD init state.", e);
            return false;
        }
    }

    /**
     * Called by your external code to start the recognition service (connect to WebSocket, etc.).
     */
    @Override
    public void start() {
        Log.d(TAG, "Starting Speech Recognition Service");
    }

    /**
     * Called by your external code to stop the recognition service.
     */
    @Override
    public void destroy() {
        Log.d(TAG, "Destroying Speech Recognition Service");
        vadRunning = false;
        //ServerComms.getInstance().disconnectWebSocket();
    }

    /**
     * Create a new instance, ensuring old one is destroyed.
     */
    public static synchronized SpeechRecAugmentos getInstance(Context context) {
        if (instance != null) {
            instance.destroy();
        }
        instance = new SpeechRecAugmentos(context);
        return instance;
    }

    /**
     * If you had logic to update dynamic ASR config, you can call:
     */
    public void updateConfig(List<AsrStreamKey> languages) {
        ServerComms.getInstance().updateAsrConfig(languages);
    }

    /**
     * ServerComms calls this whenever it receives "interim"/"final" messages from the server
     * that relate to speech or translation. We then post them to the EventBus.
     */
    public void handleSpeechJson(JSONObject msg) {
        // Example parse logic for "interim"/"final"
        try {
            long timestamp = (long) (msg.getDouble("timestamp") * 1000);
            String type = msg.getString("type"); // "interim" or "final"
            String language = msg.getString("language");
            String translateLanguage = msg.optString("translateLanguage", null);
            boolean isTranslation = (translateLanguage != null);
            String text = msg.getString("text");

            if ("interim".equals(type)) {
                if (isTranslation) {
                    EventBus.getDefault().post(new TranslateOutputEvent(text, language, translateLanguage, timestamp, false));
                } else {
                    EventBus.getDefault().post(new SpeechRecOutputEvent(text, language, timestamp, false));
                }
            } else {
                // "final"
                if (isTranslation) {
                    EventBus.getDefault().post(new TranslateOutputEvent(text, language, translateLanguage, timestamp, true));
                } else {
                    EventBus.getDefault().post(new SpeechRecOutputEvent(text, language, timestamp, true));
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error parsing speech JSON: " + msg, e);
        }
    }

    /**
     * Handles microphone state changes and propagates to all components
     * 
     * @param state true if microphone is on, false otherwise
     * @param requiredData List of required data
     */
    public void microphoneStateChanged(boolean state, List<SpeechRequiredDataType> requiredData){
        // Pass to VAD
        if (vadPolicy != null){
            vadPolicy.microphoneStateChanged(state);
        }
        
        // Pass to transcriber
        if (sherpaTranscriber != null && sherpaTranscriber.isInitialized()) {
            sherpaTranscriber.microphoneStateChanged(state);
        }



        this.currentRequiredData = requiredData;

        if (requiredData.contains(SpeechRequiredDataType.PCM) && requiredData.contains(SpeechRequiredDataType.TRANSCRIPTION)) {
            this.sendPcmToBackend = true;
            this.sendTranscriptionToBackend = true;
        } else if (requiredData.contains(SpeechRequiredDataType.PCM)) {
            this.sendPcmToBackend = true;
            this.sendTranscriptionToBackend = false;
        } else if (requiredData.contains(SpeechRequiredDataType.TRANSCRIPTION)) {
            this.sendTranscriptionToBackend = true;
            this.sendPcmToBackend = false;
        } else if (requiredData.contains(SpeechRequiredDataType.PCM_OR_TRANSCRIPTION)) {
            // TODO: bandwidth of the internet if it falls below certain threshold decide to send PCM or Transcription
            if (this.enforceLocalTranscription) {
                this.sendTranscriptionToBackend = true;
                this.sendPcmToBackend = false;
            } else {
                this.sendPcmToBackend = true;
                this.sendTranscriptionToBackend = false;
            }
        }
        
        Log.d(TAG, "Microphone state changed to: " + (state ? "ON" : "OFF") + " with required data: " + requiredData);
    }

    public void changeBypassVadForDebuggingState(boolean bypassVadForDebugging) {
        Log.d(TAG, "setBypassVadForDebugging: " + bypassVadForDebugging);
        vadPolicy.changeBypassVadForDebugging(bypassVadForDebugging);
        this.bypassVadForDebugging = bypassVadForDebugging;
    }

    public void changeEnforceLocalTranscriptionState(boolean enforceLocalTranscription) {
        Log.d(TAG, "setEnforceLocalTranscription: " + enforceLocalTranscription);
        this.enforceLocalTranscription = enforceLocalTranscription;

        if (this.currentRequiredData.contains(SpeechRequiredDataType.PCM_OR_TRANSCRIPTION)) {
            if (this.enforceLocalTranscription) {
                this.sendTranscriptionToBackend = true;
                this.sendPcmToBackend = false;
            } else {
                this.sendTranscriptionToBackend = false;
                this.sendPcmToBackend = true;
            }
        }
    }

    public void changeBypassVadForPCMState(boolean bypassVadForPCM) {
        Log.d(TAG, "setBypassVadForPCM: " + bypassVadForPCM);
        vadPolicy.changeBypassVadForPCM(bypassVadForPCM);
        this.bypassVadForPCM = bypassVadForPCM;
    }
}