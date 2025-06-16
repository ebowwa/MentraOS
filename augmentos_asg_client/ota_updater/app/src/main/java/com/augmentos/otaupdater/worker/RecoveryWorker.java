package com.augmentos.otaupdater.worker;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import androidx.work.Data;
import com.augmentos.otaupdater.helper.OtaHelper;

public class RecoveryWorker extends Worker {
    private static final String TAG = "RecoveryWorker";
    private final OtaHelper otaHelper;

    public RecoveryWorker(Context context, WorkerParameters params) {
        super(context, params);
        otaHelper = new OtaHelper(context);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Log.d(TAG, "Starting recovery work");
            boolean success = otaHelper.reinstallApkFromBackup();

            Data outputData = new Data.Builder()
                    .putBoolean("success", success)
                    .build();

            return success ? Result.success(outputData) : Result.failure(outputData);
        } catch (Exception e) {
            Log.e(TAG, "Error during recovery work", e);
            Data errorData = new Data.Builder()
                    .putString("error", e.getMessage())
                    .build();
            return Result.failure(errorData);
        }
    }
}
