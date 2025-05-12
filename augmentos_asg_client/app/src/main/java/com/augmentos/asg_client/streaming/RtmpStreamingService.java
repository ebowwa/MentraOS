package com.augmentos.asg_client.streaming;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioFormat;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import android.util.Size;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import io.github.thibaultbee.streampack.data.AudioConfig;
import io.github.thibaultbee.streampack.data.VideoConfig;
import io.github.thibaultbee.streampack.error.StreamPackError;
import io.github.thibaultbee.streampack.ext.rtmp.streamers.CameraRtmpLiveStreamer;
import io.github.thibaultbee.streampack.listeners.OnConnectionListener;
import io.github.thibaultbee.streampack.listeners.OnErrorListener;
import io.github.thibaultbee.streampack.views.PreviewView;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;

public class RtmpStreamingService extends Service {
    private static final String TAG = "RtmpStreamingService";
    private static final String CHANNEL_ID = "RtmpStreamingChannel";
    private static final int NOTIFICATION_ID = 8888;

    private final IBinder mBinder = new LocalBinder();
    private CameraRtmpLiveStreamer mStreamer;
    private String mRtmpUrl;
    private boolean mIsStreaming = false;

    public class LocalBinder extends Binder {
        public RtmpStreamingService getService() {
            return RtmpStreamingService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();

        // Create notification channel
        createNotificationChannel();

        // Register with EventBus
        if (!EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().register(this);
        }

        // Initialize the streamer
        initStreamer();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Start as a foreground service with notification
        startForeground(NOTIFICATION_ID, createNotification());

        // Launch the streaming activity if requested
        if (intent != null) {
            String rtmpUrl = intent.getStringExtra("rtmp_url");
            if (intent.getBooleanExtra("launch_activity", false)) {
                launchStreamingActivity(rtmpUrl);
            }
        }

        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return mBinder;
    }

    @Override
    public void onDestroy() {
        stopStreaming();
        releaseStreamer();

        // Unregister from EventBus
        if (EventBus.getDefault().isRegistered(this)) {
            EventBus.getDefault().unregister(this);
        }

        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "RTMP Streaming Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows when the app is streaming via RTMP");
            channel.enableLights(true);
            channel.setLightColor(Color.BLUE);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        String contentText = mIsStreaming ? "Streaming to RTMP" : "Ready to stream";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("AugmentOS Streaming")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification());
        }
    }

    @SuppressLint("MissingPermission")
    private void initStreamer() {
        if (mStreamer != null) {
            releaseStreamer();
        }

        try {
            Log.d(TAG, "Initializing streamer");

            // Create new streamer with error and connection listeners
            mStreamer = new CameraRtmpLiveStreamer(
                    this,
                    true,
                    new OnErrorListener() {
                        @Override
                        public void onError(StreamPackError error) {
                            Log.e(TAG, "Streaming error: " + error.getMessage());
                            EventBus.getDefault().post(new StreamingEvent.Error("Streaming error: " + error.getMessage()));
                            stopStreaming();
                        }
                    },
                    new OnConnectionListener() {
                        @Override
                        public void onSuccess() {
                            Log.i(TAG, "RTMP connection successful");
                            EventBus.getDefault().post(new StreamingEvent.Connected());
                        }

                        @Override
                        public void onFailed(String message) {
                            Log.e(TAG, "RTMP connection failed: " + message);
                            EventBus.getDefault().post(new StreamingEvent.ConnectionFailed(message));
                            stopStreaming();
                        }

                        @Override
                        public void onLost(String message) {
                            Log.i(TAG, "RTMP connection lost: " + message);
                            EventBus.getDefault().post(new StreamingEvent.Disconnected());
                            stopStreaming();
                        }
                    }
            );

            // For MIME type, use the actual mime type instead of null
            String audioMimeType = MediaFormat.MIMETYPE_AUDIO_AAC; // Default to AAC

            // Get the default profile for this MIME type
            int audioProfile = MediaCodecInfo.CodecProfileLevel.AACObjectLC; // Default for AAC

            // Configure audio settings using proper constructor
            AudioConfig audioConfig = new AudioConfig(
                    MediaFormat.MIMETYPE_AUDIO_AAC,  // Use actual mime type instead of null
                    128000,              // 128 kbps
                    44100,               // 44.1 kHz
                    AudioFormat.CHANNEL_IN_STEREO,
                    audioProfile,    // Default profile
                    0,                   // Default byte format
                    true,                // Enable echo cancellation
                    true                 // Enable noise suppression
            );

            // For MIME type, use the actual mime type instead of null
            String mimeType = MediaFormat.MIMETYPE_VIDEO_AVC; // Default to H.264
            int profile = VideoConfig.Companion.getBestProfile(mimeType);
            int level = VideoConfig.Companion.getBestLevel(mimeType, profile);

            // Configure video settings using proper constructor
            VideoConfig videoConfig = new VideoConfig(
                    MediaFormat.MIMETYPE_VIDEO_AVC,  // Use actual mime type instead of null
                    2000000,             // 2 Mbps
                    new Size(640, 480),  // Lower resolution for testing
                    30,                  // 30 frames per second
                    profile,             // Default profile
                    level,               // Default level
                    0.0f                 // Default bitrate factor
            );

            // Apply configurations
            mStreamer.configure(videoConfig);
            mStreamer.configure(audioConfig);

            // Notify that we're ready to connect a preview
            EventBus.getDefault().post(new StreamingEvent.Ready());
            Log.i(TAG, "Streamer initialized successfully");

        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize streamer", e);
            EventBus.getDefault().post(new StreamingEvent.Error("Initialization failed: " + e.getMessage()));
        }
    }

    private void releaseStreamer() {
        if (mStreamer != null) {
            try {
                if (mIsStreaming) {
                    stopStreaming();
                }

                mStreamer.stopPreview();
                mStreamer.release();
                mStreamer = null;
                Log.i(TAG, "Streamer released");
            } catch (Exception e) {
                Log.e(TAG, "Error releasing streamer", e);
            }
        }
    }

    /**
     * Set the RTMP URL for streaming
     * @param rtmpUrl RTMP URL in format rtmp://server/app/streamKey
     */
    public void setRtmpUrl(String rtmpUrl) {
        this.mRtmpUrl = rtmpUrl;
        Log.i(TAG, "RTMP URL set: " + rtmpUrl);
    }

    /**
     * Start streaming to the configured RTMP URL
     */
    public void startStreaming() {
        if (mStreamer == null) {
            EventBus.getDefault().post(new StreamingEvent.Error("Streamer not initialized"));
            return;
        }

        if (mRtmpUrl == null || mRtmpUrl.isEmpty()) {
            EventBus.getDefault().post(new StreamingEvent.Error("RTMP URL not set"));
            return;
        }

        if (mIsStreaming) {
            Log.i(TAG, "Already streaming");
            return;
        }

        try {
            Log.i(TAG, "Starting streaming to " + mRtmpUrl);

            // For Kotlin's suspend functions, we need to provide a Continuation
            mStreamer.startStream(mRtmpUrl, new Continuation<kotlin.Unit>() {
                @Override
                public CoroutineContext getContext() {
                    return EmptyCoroutineContext.INSTANCE;
                }

                @Override
                public void resumeWith(Object o) {
                    if (o instanceof Throwable) {
                        Log.e(TAG, "Error starting stream", (Throwable)o);
                        EventBus.getDefault().post(new StreamingEvent.Error("Failed to start streaming: " + ((Throwable)o).getMessage()));
                    } else {
                        mIsStreaming = true;
                        updateNotification();
                        Log.i(TAG, "Streaming started to " + mRtmpUrl);
                        EventBus.getDefault().post(new StreamingEvent.Started());
                    }
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "Failed to start streaming", e);
            EventBus.getDefault().post(new StreamingEvent.Error("Failed to start streaming: " + e.getMessage()));
        }
    }

    /**
     * Stop the current streaming session
     */
    public void stopStreaming() {
        if (mStreamer != null && mIsStreaming) {
            try {
                Log.i(TAG, "Stopping streaming");

                // For Kotlin's suspend functions, we need to provide a Continuation
                mStreamer.stopStream(new Continuation<kotlin.Unit>() {
                    @Override
                    public CoroutineContext getContext() {
                        return EmptyCoroutineContext.INSTANCE;
                    }

                    @Override
                    public void resumeWith(Object o) {
                        if (o instanceof Throwable) {
                            Log.e(TAG, "Error stopping stream", (Throwable)o);
                            EventBus.getDefault().post(new StreamingEvent.Error("Failed to stop streaming: " + ((Throwable)o).getMessage()));
                        } else {
                            mIsStreaming = false;
                            updateNotification();
                            Log.i(TAG, "Streaming stopped");
                            EventBus.getDefault().post(new StreamingEvent.Stopped());
                        }
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "Error stopping stream", e);
                EventBus.getDefault().post(new StreamingEvent.Error("Failed to stop streaming: " + e.getMessage()));
            }
        }
    }

    /**
     * Attaches a PreviewView to the streamer for displaying camera preview
     * @param previewView the PreviewView to use for preview
     */
    public void attachPreview(PreviewView previewView) {
        if (mStreamer != null) {
            // Set the streamer on the PreviewView
            previewView.setStreamer(mStreamer);
        } else {
            Log.e(TAG, "Cannot attach preview: streamer not initialized");
        }
    }

    /**
     * Check if currently streaming
     * @return true if streaming, false otherwise
     */
    public boolean isStreaming() {
        return mIsStreaming;
    }

    /**
     * Launch the streaming activity
     * @param rtmpUrl Optional RTMP URL to pass to the activity
     */
    public void launchStreamingActivity(String rtmpUrl) {
        Intent intent = new Intent(this, StreamingActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (rtmpUrl != null && !rtmpUrl.isEmpty()) {
            intent.putExtra("rtmp_url", rtmpUrl);
        }

        startActivity(intent);
        Log.d(TAG, "Launched StreamingActivity");
    }

    /**
     * Handle commands from other components
     */
    @Subscribe(threadMode = ThreadMode.MAIN)
    public void onStreamingCommand(StreamingCommand command) {
        if (command instanceof StreamingCommand.Start) {
            startStreaming();
        } else if (command instanceof StreamingCommand.Stop) {
            stopStreaming();
        } else if (command instanceof StreamingCommand.SetRtmpUrl) {
            setRtmpUrl(((StreamingCommand.SetRtmpUrl) command).getRtmpUrl());
        } else if (command instanceof StreamingCommand.LaunchActivity) {
            launchStreamingActivity(((StreamingCommand.LaunchActivity) command).getRtmpUrl());
        }
    }
}