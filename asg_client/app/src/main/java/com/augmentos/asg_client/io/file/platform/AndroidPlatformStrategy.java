package com.augmentos.asg_client.io.file.platform;

import android.content.Context;
import com.augmentos.asg_client.logging.Logger;
import com.augmentos.asg_client.logging.AndroidLogger;
import java.io.File;

/**
 * Android platform strategy implementation.
 * Follows Open/Closed Principle by extending PlatformStrategy.
 */
public class AndroidPlatformStrategy implements PlatformStrategy {
    
    private final Context context;
    
    public AndroidPlatformStrategy(Context context) {
        this.context = context;
    }
    
    @Override
    public File getBaseDirectory() {
        return new File(context.getFilesDir(), "asg_files");
    }
    
    @Override
    public Logger createLogger() {
        return new AndroidLogger();
    }
    
    @Override
    public String getPlatformName() {
        return "Android";
    }
    
    @Override
    public boolean isSupported() {
        return context != null;
    }
} 