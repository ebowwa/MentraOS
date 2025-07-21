package com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses;

import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesOperatingSystem;

public class MentraNextGlasses extends SmartGlassesDevice {
    public MentraNextGlasses() {
        deviceModelName = "E2:D5:A2:9E:A0:7A";
        deviceIconName = "er_g1";
        anySupport = true;
        fullSupport = true;
        glassesOs = SmartGlassesOperatingSystem.MENTRA_NEXT_GLASSES;
        hasDisplay = true;
        hasSpeakers = false;
        hasCamera = false;
        hasInMic = true;
        hasOutMic = false;
        useScoMic = false;
        weight = 37;
    }
}