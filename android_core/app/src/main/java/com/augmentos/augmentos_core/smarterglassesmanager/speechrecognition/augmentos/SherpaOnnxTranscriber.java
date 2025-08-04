package com.augmentos.augmentos_core.smarterglassesmanager.speechrecognition.augmentos;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.k2fsa.sherpa.onnx.*;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * SherpaOnnxTranscriber handles real-time audio transcription using Sherpa-ONNX.
 * 
 * It works fully offline and processes PCM audio in real-time to provide partial and final ASR results.
 * This class runs on a background thread, processes short PCM chunks, and emits transcribed text using a listener.
 */
public class SherpaOnnxTranscriber {
    private static final String TAG = "SherpaOnnxTranscriber";

    private static final int SAMPLE_RATE = 16000; // Sherpa-ONNX model's required sample rate
    private static final int QUEUE_CAPACITY = 100; // Max number of audio buffers to keep in queue

    private final Context context;
    private final BlockingQueue<byte[]> pcmQueue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private Thread workerThread;

    private OnlineRecognizer recognizer;
    private OnlineStream stream;

    private String lastPartialResult = "";

    private volatile TranscriptListener transcriptListener;
    
    // Dynamic model path support
    private static String customModelPath = null;

    /**
     * Interface to receive transcription results from Sherpa-ONNX.
     */
    public interface TranscriptListener {
        /** Called with live partial transcription (not final yet). */
        void onPartialResult(String text);

        /** Called when an utterance ends and final text is available. */
        void onFinalResult(String text);
    }

    /**
     * Constructor that accepts an Android context to load model assets.
     */
    public SherpaOnnxTranscriber(Context ctx) {
        this.context = ctx;
    }

    /**
     * Initialize the Sherpa-ONNX recognizer.
     * Loads models and configuration, sets up processing thread.
     */
    public void init() {
        try {
            // Check for dynamic model path first
            String modelPath = getModelPath();
            
            // Load model file paths
            OnlineModelConfig modelConfig = new OnlineModelConfig();
            OnlineRecognizerConfig config = new OnlineRecognizerConfig();
            
            if (modelPath != null && isModelAvailable(modelPath)) {
                // Use dynamic model path - but we still need to provide AssetManager
                Log.i(TAG, "Using dynamic model path: " + modelPath);
                
                // Detect model type based on available files
                File ctcModelFile = new File(modelPath, "model.int8.onnx");
                File transducerEncoderFile = new File(modelPath, "encoder.onnx");
                
                if (ctcModelFile.exists()) {
                    // NeMo CTC model detected
                    Log.i(TAG, "Detected NeMo CTC model at " + modelPath);
                    
                    OnlineNeMoCtcModelConfig ctc = new OnlineNeMoCtcModelConfig();
                    ctc.setModel(ctcModelFile.getAbsolutePath());
                    
                    modelConfig.setNeMoCtc(ctc);
                    modelConfig.setTokens(new File(modelPath, "tokens.txt").getAbsolutePath());
                    modelConfig.setNumThreads(1);
                    
                } else if (transducerEncoderFile.exists()) {
                    // Transducer model detected
                    Log.i(TAG, "Detected transducer model at " + modelPath);
                    
                    OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig();
                    transducer.setEncoder(new File(modelPath, "encoder.onnx").getAbsolutePath());
                    transducer.setDecoder(new File(modelPath, "decoder.onnx").getAbsolutePath());
                    transducer.setJoiner(new File(modelPath, "joiner.onnx").getAbsolutePath());
                    
                    modelConfig.setTransducer(transducer);
                    modelConfig.setTokens(new File(modelPath, "tokens.txt").getAbsolutePath());
                    modelConfig.setNumThreads(1);
                    
                } else {
                    throw new RuntimeException("No valid model files found at path: " + modelPath);
                }
                
                config.setModelConfig(modelConfig);
                config.setDecodingMethod("greedy_search");
                config.setEnableEndpoint(true);
                
                // Still need to pass AssetManager, even though we're using file paths
                recognizer = new OnlineRecognizer(context.getAssets(), config);
                
            } else {
                // No model available - transcription disabled
                Log.w(TAG, "No Sherpa ONNX model available. Transcription will be disabled.");
                Log.w(TAG, "Please download a model using the model downloader in settings.");
                
                // Set recognizer to null to indicate no model is available
                recognizer = null;
                stream = null;
                return; // Exit early - don't start processing thread
            }

            stream = recognizer.createStream("");

            startProcessingThread();
            running.set(true);

            Log.i(TAG, "Sherpa-ONNX ASR initialized successfully");

        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize Sherpa-ONNX", e);
        }
    }

    /**
     * Feed PCM audio data (16-bit little endian) into the transcriber.
     * This method should be called continuously with short chunks (e.g., 100-300ms).
     */
    public void acceptAudio(byte[] pcm16le) {
        if (!running.get()) return;
        byte[] copiedData = pcm16le.clone();
        pcmQueue.offer(copiedData);
    }

    /**
     * Start a background thread to continuously consume audio and decode using Sherpa.
     */
    private void startProcessingThread() {
        workerThread = new Thread(this::runLoop, "SherpaOnnxProcessor");
        workerThread.setDaemon(true);
        workerThread.start();
    }

    /**
     * Main processing loop that handles transcription in real-time.
     * Pulls audio from queue, feeds into Sherpa, emits partial/final results.
     */
    private void runLoop() {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        while (running.get()) {
            try {
                if (recognizer == null || stream == null) continue;

                int chunksCollected = 0;
                buffer.reset();

                // each chunk is 10ms of audio. so we collect 10 chunks to make 100ms of audio before processing
                while (chunksCollected < 10) {
                    byte[] data = pcmQueue.poll(50, TimeUnit.MILLISECONDS);
                    if (data != null) {
                        buffer.write(data);
                        chunksCollected++;
                    } else {
                        break;
                    }
                }
                byte[] fullData = buffer.toByteArray();
                if (fullData == null) continue;

                // Convert PCM to float [-1.0, 1.0]
                float[] floatBuf = toFloatArray(fullData);
                stream.acceptWaveform(floatBuf, SAMPLE_RATE);

                // Decode continuously while model is ready
                while (recognizer.isReady(stream)) {
                    recognizer.decode(stream);
                }

                // If utterance endpoint detected
                if (recognizer.isEndpoint(stream)) {
                    String finalText = recognizer.getResult(stream).getText().trim();

                    if (!finalText.isEmpty() && transcriptListener != null) {
                        mainHandler.post(() -> transcriptListener.onFinalResult(finalText));
                    }

                    recognizer.reset(stream); // Start new utterance
                    lastPartialResult = "";
                } else {
                    // Emit partial results if changed
                    String partial = recognizer.getResult(stream).getText().trim();

                    if (!partial.equals(lastPartialResult) && !partial.isEmpty() && transcriptListener != null) {
                        lastPartialResult = partial;
                        mainHandler.post(() -> transcriptListener.onPartialResult(partial));
                    }
                }

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                Log.i(TAG, "Processing thread interrupted");
            } catch (Throwable t) {
                Log.e(TAG, "Unexpected error during ASR loop", t);

                // Attempt stream reset to recover
                try {
                    if (recognizer != null && stream != null) {
                        recognizer.reset(stream);
                    }
                } catch (Exception resetEx) {
                    Log.e(TAG, "Failed to reset stream after error", resetEx);
                }
            }
        }

        Log.i(TAG, "ASR processing thread stopped");
    }

    /**
     * Convert 16-bit PCM byte array (little-endian) to float array [-1.0, 1.0].
     */
    private float[] toFloatArray(byte[] pcm16leData) {
        float[] samples = new float[pcm16leData.length / 2];
        ByteBuffer bb = ByteBuffer.wrap(pcm16leData).order(ByteOrder.LITTLE_ENDIAN);

        for (int i = 0; i < samples.length; ++i) {
            samples[i] = bb.getShort() / 32768.0f;
        }

        return samples;
    }

    /**
     * Handles mic ON/OFF state changes. Clears audio buffer and resets stream if mic is off.
     */
    public void microphoneStateChanged(boolean state) {
        if (!state) {
            pcmQueue.clear();

            if (recognizer != null && stream != null) {
                try {
                    recognizer.reset(stream);
                    lastPartialResult = "";
                    Log.d(TAG, "Microphone off — stream reset");
                } catch (Exception e) {
                    Log.e(TAG, "Error resetting stream on mic off", e);
                }
            }
        } else {
            Log.d(TAG, "Microphone on");
        }
    }

    /**
     * Cleanly shuts down the transcriber.
     * Stops background thread, clears audio queue, and releases Sherpa resources.
     */
    public void shutdown() {
        running.set(false);

        if (workerThread != null) {
            workerThread.interrupt();
            try {
                workerThread.join(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        try {
            if (stream != null) {
                stream.release();
                stream = null;
            }
            if (recognizer != null) {
                recognizer.release();
                recognizer = null;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error releasing Sherpa resources", e);
        }

        pcmQueue.clear();
        Log.i(TAG, "Transcriber shut down cleanly");
    }

    /**
     * Register a listener to receive partial and final transcription updates.
     */
    public void setTranscriptListener(TranscriptListener listener) {
        this.transcriptListener = listener;
    }

    /**
     * Check if the transcriber was successfully initialized.
     */
    public boolean isInitialized() {
        return recognizer != null && stream != null;
    }
    
    /**
     * Get the current model path, checking system property first, then SharedPreferences
     */
    private String getModelPath() {
        // First check system property (set by FileProviderModule)
        String systemPath = System.getProperty("stt.model.path");
        if (systemPath != null && !systemPath.isEmpty()) {
            customModelPath = systemPath;
            return systemPath;
        }
        
        // Fall back to stored custom path
        return customModelPath;
    }
    
    /**
     * Set a custom model path for dynamic model loading
     */
    public static void setModelPath(String path) {
        customModelPath = path;
        System.setProperty("stt.model.path", path);
    }
    
    /**
     * Check if a model is available at the given path
     */
    public static boolean isModelAvailable(String path) {
        if (path == null) return false;
        
        // Check for tokens.txt (required for all models)
        File tokensFile = new File(path, "tokens.txt");
        if (!tokensFile.exists()) {
            Log.w(TAG, "Missing tokens.txt file at: " + path);
            return false;
        }
        
        // Check for CTC model
        File ctcModelFile = new File(path, "model.int8.onnx");
        if (ctcModelFile.exists()) {
            Log.i(TAG, "CTC model found at: " + path);
            return true;
        }
        
        // Check for transducer model
        String[] transducerFiles = {"encoder.onnx", "decoder.onnx", "joiner.onnx"};
        boolean allTransducerFilesPresent = true;
        for (String fileName : transducerFiles) {
            File file = new File(path, fileName);
            if (!file.exists()) {
                allTransducerFilesPresent = false;
                break;
            }
        }
        
        if (allTransducerFilesPresent) {
            Log.i(TAG, "Transducer model found at: " + path);
            return true;
        }
        
        Log.w(TAG, "No complete model found at: " + path);
        return false;
    }
}
