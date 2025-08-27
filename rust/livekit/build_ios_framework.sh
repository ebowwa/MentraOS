
# export IPHONEOS_DEPLOYMENT_TARGET=12.0
cargo build --release --target aarch64-apple-ios
# cargo build --release --target aarch64-apple-ios-sim

# xcodebuild -create-xcframework \
#   -library ./target/aarch64-apple-ios/release/liblivekit_bridge.dylib \
#   -headers ./include/ \
#   -library ./target/aarch64-apple-ios-sim/release/liblivekit_bridge.dylib \
#   -headers ./include/ \
#   -output ios/LiveKit.xcframework


xcodebuild -create-xcframework \
  -library ./target/aarch64-apple-ios/release/liblivekit_bridge.dylib \
  -headers ./include/ \
  -output ios/LiveKit.xcframework