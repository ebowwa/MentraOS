package com.augmentos.augmentos_core.app.eventbusmessages;

import java.io.Serializable;

public class AppRequestEvent {
    public String eventId;
    public Serializable serializedEvent;
    public String sendingPackage;

    public AppRequestEvent(String eventId, Serializable serializedEvent, String sendingPackage){
        this.eventId = eventId;
        this.serializedEvent = serializedEvent;
        this.sendingPackage = sendingPackage;
    }
}
