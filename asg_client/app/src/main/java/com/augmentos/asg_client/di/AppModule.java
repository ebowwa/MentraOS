package com.augmentos.asg_client.di;

import android.content.Context;

import com.augmentos.asg_client.io.file.core.FileManager;
import com.augmentos.asg_client.io.file.core.FileManagerFactory;

public class AppModule {

    public static void initialize(Context context) {
        FileManagerFactory.initialize(context);
    }
}
