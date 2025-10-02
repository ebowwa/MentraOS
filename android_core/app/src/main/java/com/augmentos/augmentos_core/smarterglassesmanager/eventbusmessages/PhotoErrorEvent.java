package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event class for photo error responses
 * Used to communicate photo errors between components via EventBus
 */
public class PhotoErrorEvent {
    public final String requestId;
    public final String errorCode;
    public final String errorMessage;
    
    public PhotoErrorEvent(String requestId, String errorCode, String errorMessage) {
        this.requestId = requestId;
        this.errorCode = errorCode;
        this.errorMessage = errorMessage;
    }
}
