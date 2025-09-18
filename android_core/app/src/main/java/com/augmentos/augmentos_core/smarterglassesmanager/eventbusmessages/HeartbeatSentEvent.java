package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class HeartbeatSentEvent {
    public final long timestamp;
    
    public HeartbeatSentEvent(long timestamp) {
        this.timestamp = timestamp;
    }
}
