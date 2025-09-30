package com.augmentos.asg_client.audio;

import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.MediaPlayer;
import android.os.Build;
import android.util.Log;

import com.augmentos.asg_client.service.core.AsgClientService;

import java.io.IOException;

/**
 * Handles I2S audio playback for devices that route speaker output through the MCU.
 * This controller opens the I2S path via the MCU, plays an asset, and then closes the path.
 */
public class I2SAudioController {

    private static final String TAG = "I2SAudioController";

    private final Context context;

    private MediaPlayer mediaPlayer;

    public I2SAudioController(Context context) {
        this.context = context.getApplicationContext();
    }

    public synchronized void playAsset(String assetName) {
        stopCurrentPlayer();

        if (!notifyI2SState(true)) {
            Log.w(TAG, "Failed to start I2S path; skipping playback");
            return;
        }

        try {
            AssetFileDescriptor afd = context.getAssets().openFd(assetName);
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mediaPlayer.setOnCompletionListener(mp -> {
                mp.release();
                mediaPlayer = null;
                notifyI2SState(false);
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "Error playing asset " + assetName + " (what=" + what + ", extra=" + extra + ")");
                mp.release();
                mediaPlayer = null;
                notifyI2SState(false);
                return true;
            });
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (IOException e) {
            Log.e(TAG, "Unable to play asset " + assetName, e);
            notifyI2SState(false);
        }
    }

    public synchronized void stopPlayback() {
        stopCurrentPlayer();
        notifyI2SState(false);
    }

    private void stopCurrentPlayer() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (IllegalStateException ignore) {
                // best-effort
            }
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    private boolean notifyI2SState(boolean playing) {
        AsgClientService service = AsgClientService.getInstance();
        if (service != null) {
            service.handleI2SAudioState(playing);
            return true;
        }

        Intent intent = new Intent(context, AsgClientService.class);
        intent.setAction(AsgClientService.ACTION_I2S_AUDIO_STATE);
        intent.putExtra(AsgClientService.EXTRA_I2S_AUDIO_PLAYING, playing);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to deliver I2S state intent", e);
            return false;
        }
    }
}
