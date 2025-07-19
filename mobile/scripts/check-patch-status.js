#!/usr/bin/env node

const os = require('os');
const { execSync } = require('child_process');

function getMacOSVersion() {
  if (os.platform() !== 'darwin') {
    return null;
  }
  
  try {
    const version = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
    return version;
  } catch (error) {
    return 'Unknown';
  }
}

console.log('=== Patch Status Check ===');
console.log(`Platform: ${os.platform()}`);
console.log(`OS Release: ${os.release()}`);

if (os.platform() === 'darwin') {
  const macOSVersion = getMacOSVersion();
  console.log(`macOS Version: ${macOSVersion}`);
  
  const majorVersion = parseInt(macOSVersion.split('.')[0]);
  if (majorVersion >= 26) {
    console.log('\n✓ expo-localization patch WILL be applied (macOS 26 Tahoe)');
  } else {
    console.log('\n✗ expo-localization patch will NOT be applied (only needed for macOS 26 Tahoe)');
  }
} else if (os.platform() === 'linux') {
  console.log('\n✗ expo-localization patch will NOT be applied (Linux)');
} else {
  console.log('\n✗ expo-localization patch will NOT be applied (unsupported platform)');
}

console.log('\nTo manually control patching, you can set:');
console.log('  FORCE_EXPO_LOCALIZATION_PATCH=true  - Always apply the patch');
console.log('  SKIP_EXPO_LOCALIZATION_PATCH=true   - Never apply the patch');