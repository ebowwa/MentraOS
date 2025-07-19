#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Function to get macOS version
function getMacOSVersion() {
  if (os.platform() !== 'darwin') {
    return null;
  }
  
  try {
    const version = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
    const majorVersion = parseInt(version.split('.')[0]);
    return majorVersion;
  } catch (error) {
    console.error('Failed to get macOS version:', error);
    return null;
  }
}

// Function to check if we should apply the expo-localization patch
function shouldApplyExpoLocalizationPatch() {
  // Check for environment variable overrides
  if (process.env.FORCE_EXPO_LOCALIZATION_PATCH === 'true') {
    console.log('Force applying expo-localization patch (FORCE_EXPO_LOCALIZATION_PATCH=true)');
    return true;
  }
  
  if (process.env.SKIP_EXPO_LOCALIZATION_PATCH === 'true') {
    console.log('Skipping expo-localization patch (SKIP_EXPO_LOCALIZATION_PATCH=true)');
    return false;
  }
  
  const platform = os.platform();
  
  // Skip patch on Linux
  if (platform === 'linux') {
    console.log('Skipping expo-localization patch on Linux');
    return false;
  }
  
  // Skip patch on Windows
  if (platform === 'win32') {
    console.log('Skipping expo-localization patch on Windows');
    return false;
  }
  
  // On macOS, only apply for specific versions
  if (platform === 'darwin') {
    const macOSVersion = getMacOSVersion();
    
    // Only apply patch for macOS 26 (Tahoe beta)
    // All other versions including macOS 15 (Sequoia) don't need this patch
    if (macOSVersion && macOSVersion === 26) {
      console.log(`Applying expo-localization patch for macOS ${macOSVersion} (Tahoe)`);
      return true;
    } else {
      console.log(`Skipping expo-localization patch for macOS ${macOSVersion || 'unknown'}`);
      return false;
    }
  }
  
  return false;
}

// Main function
function main() {
  const patchesDir = path.join(__dirname, '..', 'patches');
  const expoLocalizationPatch = path.join(patchesDir, 'expo-localization+16.0.1.patch');
  const backupPath = path.join(patchesDir, 'expo-localization+16.0.1.patch.backup');
  
  // Move expo-localization patch to backup if we shouldn't apply it
  if (!shouldApplyExpoLocalizationPatch() && fs.existsSync(expoLocalizationPatch)) {
    fs.renameSync(expoLocalizationPatch, backupPath);
    console.log('Temporarily moved expo-localization patch to backup');
  }
  
  // Run patch-package
  let patchError = null;
  try {
    console.log('Running patch-package...');
    execSync('npx patch-package', { stdio: 'inherit' });
  } catch (error) {
    patchError = error;
  }
  
  // Always restore the patch file if we moved it
  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, expoLocalizationPatch);
    console.log('Restored expo-localization patch file');
  }
  
  // Exit with error if patch-package failed
  if (patchError) {
    console.error('patch-package failed:', patchError);
    process.exit(1);
  }
}

// Run the script
main();