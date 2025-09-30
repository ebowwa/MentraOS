package com.augmentos.asg_client.io.hardware.managers;

import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.media.MediaPlayer;
import android.util.Log;

import com.augmentos.asg_client.io.hardware.core.BaseHardwareManager;

import java.io.IOException;

/**
 * Hardware implementation for generic Android glasses that expose a standard torch and audio path.
 */
public class StandardHardwareManager extends BaseHardwareManager {

    private static final String TAG = "StandardHardwareManager";

    private final CameraManager cameraManager;
    private String cameraWithFlash;
    private boolean torchEnabled;

    private MediaPlayer mediaPlayer;

    public StandardHardwareManager(Context context) {
        super(context);
        cameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
    }

    @Override
    public void initialize() {
        super.initialize();
        detectFlashCamera();
    }

    @Override
    public boolean supportsRecordingLed() {
        return cameraWithFlash != null;
    }

    @Override
    public void setRecordingLedOn() {
        setTorch(true);
    }

    @Override
    public void setRecordingLedOff() {
        setTorch(false);
    }

    @Override
    public void setRecordingLedBlinking() {
        // Simple blink: turn on, schedule off via stopRecordingLedBlinking or caller preference.
        setTorch(true);
    }

    @Override
    public void setRecordingLedBlinking(long onDurationMs, long offDurationMs) {
        setTorch(true);
        // Note: caller should manage timing; we expose the basic capability only.
    }

    @Override
    public void stopRecordingLedBlinking() {
        setTorch(false);
    }

    @Override
    public void flashRecordingLed(long durationMs) {
        setTorch(true);
        // Responsibility for scheduling the off state remains with the caller.
    }

    @Override
    public boolean isRecordingLedOn() {
        return torchEnabled;
    }

    @Override
    public boolean supportsAudioPlayback() {
        return true;
    }

    @Override
    public void playAudioAsset(String assetName) {
        stopAudioPlayback();
        mediaPlayer = new MediaPlayer();
        try {
            var afd = context.getAssets().openFd(assetName);
            mediaPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mediaPlayer.setOnCompletionListener(mp -> {
                mp.release();
                mediaPlayer = null;
            });
            mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "Error playing asset " + assetName + " (" + what + "/" + extra + ")");
                mp.release();
                mediaPlayer = null;
                return true;
            });
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (IOException e) {
            Log.e(TAG, "Unable to play asset " + assetName, e);
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    @Override
    public void stopAudioPlayback() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
            } catch (IllegalStateException ignored) {
                // ignore
            }
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    @Override
    public void shutdown() {
        stopTorch();
        stopAudioPlayback();
        super.shutdown();
    }

    private void detectFlashCamera() {
        if (cameraManager == null) {
            return;
        }
        try {
            for (String id : cameraManager.getCameraIdList()) {
                CameraCharacteristics characteristics = cameraManager.getCameraCharacteristics(id);
                Boolean flashAvailable = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer lensFacing = characteristics.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flashAvailable) && lensFacing != null &&
                        lensFacing == CameraCharacteristics.LENS_FACING_BACK) {
                    cameraWithFlash = id;
                    Log.d(TAG, "Detected back camera with flash: " + id);
                    return;
                }
            }
        } catch (CameraAccessException e) {
            Log.e(TAG, "Unable to query cameras for torch support", e);
        }
    }

    private void setTorch(boolean enabled) {
        if (cameraManager == null || cameraWithFlash == null) {
            Log.w(TAG, "Torch control not available");
            return;
        }
        try {
            cameraManager.setTorchMode(cameraWithFlash, enabled);
            torchEnabled = enabled;
        } catch (CameraAccessException | SecurityException e) {
            Log.e(TAG, "Failed to set torch state", e);
        }
    }

    private void stopTorch() {
        if (torchEnabled) {
            setTorch(false);
        }
    }
}
