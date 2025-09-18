package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class LocalTranscriptionEvent {
    public String text;
    public boolean isFinal;
    public LocalTranscriptionEvent(String text, boolean isFinal) {
        this.text = text;
        this.isFinal = isFinal;
    }
}
