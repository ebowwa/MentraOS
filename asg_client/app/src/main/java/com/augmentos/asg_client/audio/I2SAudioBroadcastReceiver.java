package com.augmentos.asg_client.audio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.augmentos.asg_client.service.core.AsgClientService;

/**
 * Receives audio play state broadcasts from the ODM firmware and forwards them to
 * {@link AsgClientService} which notifies the MCU to start/stop I2S audio.
 */
public class I2SAudioBroadcastReceiver extends BroadcastReceiver {

    private static final String TAG = "I2SAudioReceiver";

    public static final String ACTION_PLAYSTATE_CHANGE = "com.xy.sound.AUDIO_PLAYSTATE_CHANGE";
    public static final String ACTION_PLAYSTATE_ACTION = "com.xy.sound.AUDIO_PLAYSTATE_ACTION";
    private static final String EXTRA_STATE = "state";
    private static final String STATE_START = "start";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) {
            Log.w(TAG, "Received null intent");
            return;
        }

        final String action = intent.getAction();
        if (!ACTION_PLAYSTATE_CHANGE.equals(action) && !ACTION_PLAYSTATE_ACTION.equals(action)) {
            Log.d(TAG, "Ignoring unrelated action: " + action);
            return;
        }

        final String state = intent.getStringExtra(EXTRA_STATE);
        if (state == null) {
            Log.w(TAG, "Missing state extra in playstate broadcast");
            return;
        }

        final boolean start = STATE_START.equalsIgnoreCase(state);
        Log.i(TAG, "Audio playstate change received: " + state + " (start=" + start + ")");

        Intent serviceIntent = new Intent(context, AsgClientService.class);
        serviceIntent.setAction(AsgClientService.ACTION_I2S_AUDIO_STATE);
        serviceIntent.putExtra(AsgClientService.EXTRA_I2S_AUDIO_PLAYING, start);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (IllegalStateException e) {
            Log.e(TAG, "Failed to start service for I2S state", e);
        }
    }
}
