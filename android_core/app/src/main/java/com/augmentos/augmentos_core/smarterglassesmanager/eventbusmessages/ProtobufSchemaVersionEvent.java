package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class ProtobufSchemaVersionEvent {
    private final int schemaVersion;
    private final String buildInfo;
    private final String deviceModelName;

    public ProtobufSchemaVersionEvent(int schemaVersion, String buildInfo, String deviceModelName) {
        this.schemaVersion = schemaVersion;
        this.buildInfo = buildInfo;
        this.deviceModelName = deviceModelName;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public String getBuildInfo() {
        return buildInfo;
    }

    public String getDeviceModelName() {
        return deviceModelName;
    }
}
