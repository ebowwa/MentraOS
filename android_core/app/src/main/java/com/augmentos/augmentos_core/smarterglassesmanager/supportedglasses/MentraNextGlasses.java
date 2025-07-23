package com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses;

import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesDevice;
import com.augmentos.augmentos_core.smarterglassesmanager.supportedglasses.SmartGlassesOperatingSystem;

public class MentraNextGlasses extends SmartGlassesDevice {
    public MentraNextGlasses() {
        deviceModelName = "Mentra Nex";
        deviceIconName = "er_g1";
        anySupport = true;
        fullSupport = true;
        glassesOs = SmartGlassesOperatingSystem.MENTRA_NEX_GLASSES;
        hasDisplay = true;
        hasSpeakers = false;
        hasCamera = false;
        hasInMic = true;
        hasOutMic = false;
        useScoMic = false;
        weight = 37;
    }
}