package com.augmentos.augmentoslib.events;

import com.augmentos.augmentoslib.ThirdPartyEdgeApp;

import java.io.Serializable;

public class KillAppEvent implements Serializable {
    public ThirdPartyEdgeApp app;
    public static final String eventId = "killAppEvent";

    public KillAppEvent(ThirdPartyEdgeApp app){
        this.app = app;
    }

}
