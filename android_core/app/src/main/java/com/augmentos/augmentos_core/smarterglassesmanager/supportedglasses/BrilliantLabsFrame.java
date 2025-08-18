package com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses;

public class BrilliantLabsFrame extends SmartGlassesDevice{
  public BrilliantLabsFrame() {
    deviceModelName = "Brilliant Labs Frame";
    deviceIconName = "frame_icon";
    anySupport = true;
    fullSupport = false; // v1 implementation
    glassesOs = SmartGlassesOperatingSystem.FRAME_OS_GLASSES;
    hasDisplay = true;
    hasSpeakers = false; // Uses phone for audio output
    hasCamera = true;
    hasInMic = true;
    hasOutMic = false;
    useScoMic = false; // Uses custom mic implementation via BLE
    weight = 39.0; // grams
  }
}