package com.mentra.mentra;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.util.Base64;
import android.util.Log;

import androidx.media3.common.MediaItem;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.common.Player;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * AudioManager handles audio playback requests for the AugmentOS Manager
 * Supports both URL-based audio (using ExoPlayer) and raw audio data (using MediaPlayer)
 * Also supports streaming audio by buffering multiple data chunks
 */
public class AudioManager {
    private static final String TAG = "AudioManager";
    private static AudioManager instance;

    private Context context;
    private Map<String, ExoPlayer> urlPlayers = new HashMap<>();
    private Map<String, MediaPlayer> dataPlayers = new HashMap<>();
    private Map<String, ByteArrayOutputStream> audioBuffers = new HashMap<>();

    private AudioManager(Context context) {
        this.context = context.getApplicationContext();
    }

    public static synchronized AudioManager getInstance(Context context) {
        if (instance == null) {
            instance = new AudioManager(context);
        }
        return instance;
    }

    public void playAudio(
            String requestId,
            String audioUrl,
            String audioData,
            String mimeType,
            float volume,
            boolean stopOtherAudio,
            String streamAction
    ) {
        Log.d(TAG, "🔊 [AudioManager.java] playAudio called with parameters:");
        Log.d(TAG, "  requestId: " + requestId);
        Log.d(TAG, "  audioUrl: " + (audioUrl != null && !audioUrl.isEmpty() ? audioUrl.substring(0, Math.min(50, audioUrl.length())) + "..." : "null/empty"));
        Log.d(TAG, "  audioData length: " + (audioData != null ? audioData.length() : 0));
        Log.d(TAG, "  mimeType: " + mimeType);
        Log.d(TAG, "  volume: " + volume);
        Log.d(TAG, "  stopOtherAudio: " + stopOtherAudio);
        Log.d(TAG, "  streamAction: " + streamAction);

        if (stopOtherAudio && !"append".equals(streamAction)) {
            Log.d(TAG, "🔊 [AudioManager.java] Stopping other audio as requested");
            stopAllAudio();
        }

        // Handle URL-based audio
        if (audioUrl != null && !audioUrl.isEmpty()) {
            Log.d(TAG, "🔊 [AudioManager.java] audioUrl provided, calling playAudioFromUrl");
            playAudioFromUrl(requestId, audioUrl, volume);
            return;
        }

        // Handle raw audio data
        if (audioData != null && !audioData.isEmpty()) {
            Log.d(TAG, "🔊 [AudioManager.java] audioData provided, calling playAudioFromData");
            playAudioFromData(requestId, audioData, mimeType, volume, streamAction);
        } else {
            Log.e(TAG, "🔊 [AudioManager.java] Neither audioUrl nor audioData provided!");
        }
    }

    private void playAudioFromUrl(String requestId, String audioUrl, float volume) {
        Log.d(TAG, "🔊 [AudioManager.java] playAudioFromUrl called:");
        Log.d(TAG, "  requestId: " + requestId);
        Log.d(TAG, "  audioUrl: " + audioUrl);
        Log.d(TAG, "  volume: " + volume);

        try {
            Log.d(TAG, "🔊 [AudioManager.java] Creating ExoPlayer...");
            ExoPlayer player = new ExoPlayer.Builder(context).build();

            Log.d(TAG, "🔊 [AudioManager.java] Creating MediaItem from URI...");
            MediaItem mediaItem = MediaItem.fromUri(audioUrl);

            Log.d(TAG, "🔊 [AudioManager.java] Setting media item and volume...");
            player.setMediaItem(mediaItem);
            player.setVolume(volume);

            Log.d(TAG, "🔊 [AudioManager.java] Adding player listener...");
            player.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    Log.d(TAG, "🔊 [AudioManager.java] Playback state changed to: " + playbackState + " for requestId: " + requestId);
                    if (playbackState == Player.STATE_ENDED) {
                        Log.d(TAG, "🔊 [AudioManager.java] Playback ended successfully for requestId: " + requestId);
                        urlPlayers.remove(requestId);
                        sendAudioPlayResponse(requestId, true, null, player.getDuration());
                        player.release();
                    } else if (playbackState == Player.STATE_IDLE) {
                        Log.w(TAG, "🔊 [AudioManager.java] Playback failed (STATE_IDLE) for requestId: " + requestId);
                        urlPlayers.remove(requestId);
                        sendAudioPlayResponse(requestId, false, "Playback failed", null);
                        player.release();
                    }
                }
            });

            Log.d(TAG, "🔊 [AudioManager.java] Storing player and starting playback...");
            urlPlayers.put(requestId, player);
            player.prepare();
            player.play();

            Log.d(TAG, "🔊 [AudioManager.java] Started playing audio from URL for requestId: " + requestId);

        } catch (Exception e) {
            Log.e(TAG, "🔊 [AudioManager.java] Failed to play audio from URL for requestId: " + requestId, e);
            sendAudioPlayResponse(requestId, false, e.getMessage(), null);
        }
    }

    private void playAudioFromData(String requestId, String audioData, String mimeType, float volume, String streamAction) {
        try {
            byte[] data = Base64.decode(audioData, Base64.DEFAULT);

            switch (streamAction != null ? streamAction : "") {
                case "start":
                    // Start new streaming session
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    buffer.write(data);
                    audioBuffers.put(requestId, buffer);
                    Log.d(TAG, "Started streaming session for requestId: " + requestId);
                    break;

                case "append":
                    // Append to existing buffer
                    ByteArrayOutputStream existingBuffer = audioBuffers.get(requestId);
                    if (existingBuffer != null) {
                        existingBuffer.write(data);
                        Log.d(TAG, "Appended data to stream for requestId: " + requestId);
                    } else {
                        Log.w(TAG, "No existing stream found for requestId: " + requestId + ", starting new one");
                        ByteArrayOutputStream newBuffer = new ByteArrayOutputStream();
                        newBuffer.write(data);
                        audioBuffers.put(requestId, newBuffer);
                    }
                    break;

                case "end":
                    // Finalize and play the complete stream
                    ByteArrayOutputStream finalBuffer = audioBuffers.get(requestId);
                    if (finalBuffer != null) {
                        finalBuffer.write(data);
                        playCompleteAudioData(requestId, finalBuffer.toByteArray(), volume);
                        audioBuffers.remove(requestId);
                    } else {
                        playCompleteAudioData(requestId, data, volume);
                    }
                    break;

                default:
                    // Single chunk audio (no streaming)
                    playCompleteAudioData(requestId, data, volume);
                    break;
            }

        } catch (Exception e) {
            Log.e(TAG, "Failed to decode or process audio data", e);
            sendAudioPlayResponse(requestId, false, e.getMessage(), null);
        }
    }

    private void playCompleteAudioData(String requestId, byte[] data, float volume) {
        try {
            // Create a temporary file for MediaPlayer
            File tempFile = File.createTempFile("audio_" + requestId, ".tmp", context.getCacheDir());
            FileOutputStream fos = new FileOutputStream(tempFile);
            fos.write(data);
            fos.close();

            MediaPlayer player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .build());

            player.setDataSource(tempFile.getAbsolutePath());
            player.setVolume(volume, volume);

            player.setOnCompletionListener(mp -> {
                dataPlayers.remove(requestId);
                sendAudioPlayResponse(requestId, true, null, (long) mp.getDuration());
                mp.release();
                tempFile.delete();
            });

            player.setOnErrorListener((mp, what, extra) -> {
                dataPlayers.remove(requestId);
                sendAudioPlayResponse(requestId, false, "MediaPlayer error: " + what, null);
                mp.release();
                tempFile.delete();
                return true;
            });

            dataPlayers.put(requestId, player);
            player.prepare();
            player.start();

            Log.d(TAG, "Started playing audio data for requestId: " + requestId);

        } catch (IOException e) {
            Log.e(TAG, "Failed to create MediaPlayer for audio data", e);
            sendAudioPlayResponse(requestId, false, e.getMessage(), null);
        }
    }

    public void stopAudio(String requestId) {
        ExoPlayer urlPlayer = urlPlayers.get(requestId);
        if (urlPlayer != null) {
            urlPlayer.stop();
            urlPlayer.release();
            urlPlayers.remove(requestId);
        }

        MediaPlayer dataPlayer = dataPlayers.get(requestId);
        if (dataPlayer != null) {
            dataPlayer.stop();
            dataPlayer.release();
            dataPlayers.remove(requestId);
        }

        audioBuffers.remove(requestId);
        Log.d(TAG, "Stopped audio for requestId: " + requestId);
    }

    public void stopAllAudio() {
        for (ExoPlayer player : urlPlayers.values()) {
            player.stop();
            player.release();
        }
        urlPlayers.clear();

        for (MediaPlayer player : dataPlayers.values()) {
            player.stop();
            player.release();
        }
        dataPlayers.clear();

        audioBuffers.clear();
        Log.d(TAG, "Stopped all audio");
    }

    private void sendAudioPlayResponse(String requestId, boolean success, String error, Long duration) {
        // For now, just log the result. In a full implementation, this would send a response
        // back through the communication channel
        Log.d(TAG, "Audio play response - requestId: " + requestId + ", success: " + success + ", error: " + error);
    }
}