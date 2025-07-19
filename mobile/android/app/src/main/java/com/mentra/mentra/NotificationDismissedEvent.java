package com.mentra.mentra;

public class NotificationDismissedEvent {
    public String appName;
    public String title;
    public String text;
    public String notificationKey;

    public NotificationDismissedEvent(String appName, String title, String text, String notificationKey){
        this.appName = appName;
        this.title = title;
        this.text = text;
        this.notificationKey = notificationKey;
    }
    
    @Override
    public String toString() {
        return "NotificationDismissed[" + appName + "]: " + title + " - " + text + " (Key: " + notificationKey + ")";
    }
} 