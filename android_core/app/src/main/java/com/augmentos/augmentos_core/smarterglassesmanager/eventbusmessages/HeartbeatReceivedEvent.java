package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class HeartbeatReceivedEvent {
    public final long timestamp;
    
    public HeartbeatReceivedEvent(long timestamp) {
        this.timestamp = timestamp;
    }
}
