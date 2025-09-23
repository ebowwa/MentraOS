package com.augmentos.augmentoslib.events;

import com.augmentos.augmentoslib.ThirdPartyEdgeApp;

import java.io.Serializable;

public class RegisterAppRequestEvent implements Serializable {
    public ThirdPartyEdgeApp thirdPartyEdgeApp;
    public static final String eventId = "registerAppRequestEvent";

    public RegisterAppRequestEvent(ThirdPartyEdgeApp thirdPartyEdgeApp){
        this.thirdPartyEdgeApp = thirdPartyEdgeApp;
    }

    public static String getEventId(){
        return("registerCommandRequestEvent");
    }
}
