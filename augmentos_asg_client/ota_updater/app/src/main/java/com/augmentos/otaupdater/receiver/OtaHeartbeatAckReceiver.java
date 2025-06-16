package com.augmentos.otaupdater.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class OtaHeartbeatAckReceiver extends BroadcastReceiver {
    private static final String TAG = "OtaHeartbeatAckReceiver";
    private static final SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US);
    private static long lastAckTime = 0;

    @Override
    public void onReceive(Context context, Intent intent) {
        if ("com.augmentos.asg_client.ACTION_HEARTBEAT_ACK".equals(intent.getAction())) {
            long currentTime = System.currentTimeMillis();
            String timestamp = sdf.format(new Date(currentTime));
            
            if (lastAckTime > 0) {
                long timeSinceLastAck = currentTime - lastAckTime;
                Log.i(TAG, String.format("Received heartbeat acknowledgment at %s (%.1f seconds since last ack)",
                    timestamp, timeSinceLastAck / 1000.0));
            } else {
                Log.i(TAG, "Received first heartbeat acknowledgment at " + timestamp);
            }
            lastAckTime = currentTime;
        }
    }
} 