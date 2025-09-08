
export IPHONEOS_DEPLOYMENT_TARGET=16.0
cargo build --release --target aarch64-apple-ios
# cargo build --release --target aarch64-apple-ios-sim

cbindgen --config cbindgen.toml --crate livekit-bridge --output include/mobile_example_temp.h
# remove Java_ and JNI_OnLoad
cat include/mobile_example_temp.h | grep -v "Java_" | grep -v "JNI_OnLoad" > include/mobile_example.h
rm include/mobile_example_temp.h

# cbindgen --config cbindgen.toml --crate livekit-bridge --output - | \
  # grep -v "Java_" | \
  # grep -v "JNI_OnLoad" > include/mobile_example.h


# xcodebuild -create-xcframework \
#   -library ./target/aarch64-apple-ios/release/liblivekit_bridge.dylib \
#   -headers ./include/ \
#   -library ./target/aarch64-apple-ios-sim/release/liblivekit_bridge.dylib \
#   -headers ./include/ \
#   -output ios/LiveKit.xcframework

rm -rf ./ios/LiveKit.xcframework

xcodebuild -create-xcframework \
  -library ./target/aarch64-apple-ios/release/liblivekit_bridge.dylib \
  -headers ./include/ \
  -output ios/LiveKit.xcframework