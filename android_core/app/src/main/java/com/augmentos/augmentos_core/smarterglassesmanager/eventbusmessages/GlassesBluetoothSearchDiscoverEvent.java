package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class GlassesBluetoothSearchDiscoverEvent {
    public String modelName;
    public String deviceName;
    public String deviceAddress;

    public GlassesBluetoothSearchDiscoverEvent(String modelName, String deviceName){
        this.modelName = modelName;
        this.deviceName = deviceName;
    }

    public GlassesBluetoothSearchDiscoverEvent(String modelName, String deviceName,String deviceAddress){
        this.modelName = modelName;
        this.deviceName = deviceName;
        this.deviceAddress = deviceAddress;
    }
}
