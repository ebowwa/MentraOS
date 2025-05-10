#!/bin/bash
# Script to build the fat AAR and integrate it into the app

echo "==== Building and Integrating StreamPackLite Fat AAR ===="

# Step 1: Build the fat AAR with all dependencies
echo "Building StreamPackLite fat AAR..."
cd StreamPackLite
./build-fat-aar.sh
cd ..

# Check if the build was successful
if [ ! -f "StreamPackLite/fat-aar-output/streampack-rtmp-fat-complete.aar" ]; then
  echo "ERROR: Fat AAR build failed. See error messages above."
  exit 1
fi

# Step 2: Ensure app/libs directory exists
mkdir -p app/libs

# Step 3: Copy the fat AAR to the app/libs directory
echo "Copying fat AAR to app/libs..."
cp StreamPackLite/fat-aar-output/streampack-rtmp-fat-complete.aar app/libs/

# Step 4: Update app/build.gradle to use the fat AAR
echo "Updating app/build.gradle to use the fat AAR..."

# Temporary file for editing
TEMP_FILE=$(mktemp)

# Replace the existing implementation lines with the fat AAR implementation
cat app/build.gradle | sed -E 's/implementation files\('\''libs\/streampack-core\.aar'\''\)/implementation(name: '\''streampack-rtmp-fat-complete'\'', ext: '\''aar'\'')/g' | sed -E '/implementation files\('\''libs\/streampack-rtmp\.aar'\''\)/d' > $TEMP_FILE
mv $TEMP_FILE app/build.gradle

echo ""
echo "==== Integration Complete ===="
echo "The fat AAR has been built and integrated into your app."
echo "It includes all dependencies, including the required camera-viewfinder:1.4.0-alpha06."
echo ""
echo "You can now build your app with:"
echo "./gradlew assembleDebug"
echo ""
echo "NOTE: You may still need the Google early-access repository in your app's build.gradle:"
echo "repositories {"
echo "    maven { url 'https://androidx.dev/archives/builds/7968150/artifacts/repository' }"
echo "}"