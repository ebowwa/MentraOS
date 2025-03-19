package com.augmentos.augmentoslib.events;

import java.io.Serializable;

public class HomeScreenEvent  implements Serializable {
    public static final String eventId = "homeScreenEvent";
    public String homeScreenText;

    public HomeScreenEvent() {
        this.homeScreenText = "";
    }

    public HomeScreenEvent(String homeScreenText) {
        this.homeScreenText = homeScreenText;
    }
}
