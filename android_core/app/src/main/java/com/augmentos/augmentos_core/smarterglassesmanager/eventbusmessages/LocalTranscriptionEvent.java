package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class LocalTranscriptionEvent {
    public String text;
    public boolean isFinal;
    public String language;
    public LocalTranscriptionEvent(String text, boolean isFinal, String language) {
        this.text = text;
        this.isFinal = isFinal;
        this.language = language;
    }
}
