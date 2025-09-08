
cargo build --release --target aarch64-apple-ios

xcodebuild -create-xcframework \
  -library ../target/aarch64-apple-ios/release/libmobile.dylib \
  -headers ./include/ \
  -output ios/MobileExample.xcframework
