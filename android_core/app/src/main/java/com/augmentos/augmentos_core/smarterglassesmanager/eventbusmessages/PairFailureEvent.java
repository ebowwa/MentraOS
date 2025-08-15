package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

/**
 * Event posted when pairing with smart glasses fails
 */
public class PairFailureEvent {
    private final String error;

    public PairFailureEvent(String error) {
        this.error = error;
    }

    public String getError() {
        return error;
    }
}