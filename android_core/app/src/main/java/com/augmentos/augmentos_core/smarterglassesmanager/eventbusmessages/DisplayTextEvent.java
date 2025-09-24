package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class DisplayTextEvent {
    //display text content
    public final String text;
    //position x
    public final int x;
    //position y
    public final int y;
    //display text size
    public final int size;
    // Timestamp
    public final long timestamp;


    public DisplayTextEvent(String text, int size, int x, int y, long timestamp) {
        this.text = text;
        this.size = size;
        this.x = x;
        this.y = y;
        this.timestamp = timestamp;
    }

    public DisplayTextEvent(String text, int size, int x, int y) {
        this.text = text;
        this.size = size;
        this.x = x;
        this.y = y;
        this.timestamp = System.currentTimeMillis();
    }
}