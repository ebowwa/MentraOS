package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class ButtonActionEvent {
    public final String button;
    public final String event;
    
    public ButtonActionEvent(String button, String event) {
        this.button = button;
        this.event = event;
    }
}
