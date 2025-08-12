package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class BleCommandReceiver {
    public final String command;
    public final String commandText;
    public final long timestamp;


    public BleCommandReceiver(String command, String commandText) {
        this.command = command;
        this.commandText = commandText;
        this.timestamp = System.currentTimeMillis();
    }
}