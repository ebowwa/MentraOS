# asg_client

This is the Android code that runs on Android-based smart glasses (ex: Mentra Live).

## Documentation

- [ASG_MEDIA_SYSTEM.md](./ASG_MEDIA_SYSTEM.md) - Detailed documentation about the camera button press system, photo/video capture workflow, and how Apps (Third Party Applications) can interact with the media system.

## Compatible Devices

- Mentra Live

This could be made to be compatible with other Android-based smart glasses with some work, such as:

- TCL Rayneo X2
- TCL Rayneo X3
- INMO Air 2
- INMO Air 3
- Other Android-based smart glasses

The necessary changes here would involve re-implementing the K900 checks (K900 or other device), and implementing the ability for the glasses to display text using an activity if the glasses have a display. Maybe use buildprop for device detection.

### Environment Setup

1. Create a `.env` file by copying the provided example:

   ```
   cp .env.example .env
   ```

2. By default, the example contains production settings:

   ```
   MENTRAOS_HOST=cloud.mentra.glass
   MENTRAOS_PORT=443
   MENTRAOS_SECURE=true
   ```

3. Clone the RTMP streaming library in this directory
   ```
   git clone git@github.com:Mentra-Community/StreamPackLite.git
   cd StreamPackLite
   git checkout working
   ```

### How to connect to Mentra Live with ADB

Mentra Live suppports ADB over WiFi. The best way to access this is:

1. Pair your Mentra Live in the MentraOS app
2. Connect it to your local WiFi network in the MentraOS app
3. Get its IP address from the "Glasses" screen in the MentraOS app
4. On your computer that's on the same WiFi network, enter `adb connect {IP_ADDRESS}:5555`

### Build Notes

- Must use Java SDK 17
  - To set this, in Android Studio, go to Settings > Build, Execution, Deployment > Build Tools > Gradle, go to Gradle JDK and select version 17

- asg_client currently depends on the "SmartGlassesManager" repo being next to it. In the future, it will be fully merged with asg_client and deleted.

##### Building OGG/Orbis C++ for ASP

(Disregard this section unless you are an OG H4CK3R... if you have to ask, you are not an OG H4CK3R)

You only have to follow these specific steps if you are building the OGG/Orbis C++ code. Otherwise, things will likely work with your regular Android Studio setup.

1. Run Linux (as you should be).
2. Install Java 17.
3. Ensure Java 17 is the default Java (can be set with `sudo update-java-alternatives`).
4. Run `chmod 777 ./gradle/` and `chmod 777 ./gradle/`.
5. Set your ANDROID_SDK_PATH WITH `export $ANDROID_SDK_PATH=<path to you Android>`.
6. Go into the Android folder and run `bash build_all.sh` to build everything.
7. If you get gradle version issues, install gradle 8.0.2: https://linuxhint.com/installing_gradle_ubuntu/ (follow the instructions, but replace 7.4.2 with 8.0.2).
8. For Subsequent builds, you can just run `assembleDebug --stacktrace` to build the APK.
9. Install APK on your phone (located in app/build/outputs/debug/).
