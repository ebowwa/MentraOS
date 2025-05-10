# RTMP Streaming Integration Notes

## Overview

The AugmentOS ASG Client app includes RTMP streaming functionality using the StreamPackLite library. This document explains the two approaches we've implemented for RTMP streaming.

## Approach 1: Fat AAR with All Dependencies (Recommended)

This approach builds a "fat AAR" that includes all dependencies, including the alpha camera-viewfinder dependency that PreviewView requires.

### How to Use

1. Run the build script:
   ```bash
   ./build-and-use-fat-aar.sh
   ```

2. This script will:
   - Build the fat AAR with all dependencies included
   - Copy it to your app/libs directory
   - Update your build.gradle to use the fat AAR

3. Ensure you have the Google early-access repository in your app's build.gradle:
   ```gradle
   repositories {
       maven { url 'https://androidx.dev/archives/builds/7968150/artifacts/repository' }
   }
   ```

4. You can now use PreviewView directly in your code without ClassNotFoundException issues.

### Behind the Scenes

The fat AAR includes:
- StreamPackLite core library
- RTMP extension
- All required dependencies, including:
  - androidx.camera:camera-viewfinder:1.4.0-alpha06
  - CameraX components
  - Kotlin dependencies
  - RTMP dependencies

## Approach 2: Container-Based Workaround (Fallback)

If the fat AAR approach doesn't work for some reason, you can use the container-based approach as a fallback.

### Container-Based Implementation

We use a container-based approach to avoid ClassNotFoundException issues:

1. We use a regular FrameLayout (`camera_preview_container`) in our XML layouts
2. We create the StreamPackLite's `PreviewView` programmatically only when needed
3. We add the `PreviewView` to the container at runtime

### Dependency Management for Container-Based Approach

**IMPORTANT**: When using the container approach, we explicitly DO NOT include the alpha viewfinder dependency:
```gradle
// DO NOT include this dependency when using container approach
// implementation "androidx.camera:camera-viewfinder:1.4.0-alpha06"
```

Instead, we include:
```gradle
implementation files('libs/streampack-core.aar')
implementation files('libs/streampack-rtmp.aar')
implementation 'video.api:rtmpdroid:1.2.1'
implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3'
implementation 'org.jetbrains.kotlin:kotlin-stdlib:1.9.0'
```

We handle duplicate classes with proper packaging options:
```gradle
packagingOptions {
    resources {
        pickFirsts += [
            'META-INF/**',
            '**/*.kotlin_metadata',
            '**/*.kotlin_module',
            '**/*.kotlin_builtins',
            'io/github/thibaultbee/streampack/**/*.class'
        ]
    }
    
    jniLibs {
        pickFirsts += '**/*.so'
    }
}
```

### Class Usage Guidelines for Container-Based Approach

1. NEVER import `io.github.thibaultbee.streampack.views.PreviewView` at the top of your files
2. NEVER use `PreviewView` directly in XML layouts
3. ALWAYS use the container-based approach:
   ```java
   // First get the container
   FrameLayout container = findViewById(R.id.camera_preview_container);
   
   // Then create PreviewView programmatically ONLY when needed
   io.github.thibaultbee.streampack.views.PreviewView previewView = 
       new io.github.thibaultbee.streampack.views.PreviewView(context);
   
   // Add it to the container
   container.addView(previewView);
   
   // Now use it with the RTMPStreamingExample
   RTMPStreamingExample streamer = new RTMPStreamingExample(context, previewView);
   ```

## Performance Considerations

The StreamPackLite configuration has been optimized for smart glasses:
- Low video resolution (640x480)
- Low bitrate (250 kbps)
- Low framerate (15 fps)
- Mono audio (32 kbps, 44.1kHz)

## Troubleshooting

If you encounter:

**ClassNotFoundException: androidx.camera.viewfinder.CameraViewfinder**:
- If using the Container-based approach, you're likely importing PreviewView directly at application startup
- If using the Fat AAR approach, make sure you've added the Google early-access repository

**Multiple dex files define io.github.thibaultbee.streampack...**:
- Check that you have the proper `pickFirst` directives in `build.gradle`

**Camera preview issues**:
- Ensure camera permissions are granted
- Check that no other app is using the camera

## Resources

For more details on StreamPackLite usage, see:
- StreamPackLite/SIMPLIFIED-INTEGRATION.md
- StreamPackLite/SOLUTION-SUMMARY.md