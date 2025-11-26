import { MentraClient } from "../client";
import {
    GlassesToCloudMessageType,
    ButtonPress,
    TouchEvent,
    HeadPosition,
    Vad,
} from "@mentra/types";

export class HardwareModule {
    constructor(private client: MentraClient) { }

    public pressButton(buttonId: string, pressType: "short" | "long" = "short") {
        const msg: ButtonPress = {
            type: GlassesToCloudMessageType.BUTTON_PRESS,
            buttonId,
            pressType,
        };
        this.client.send(msg);
    }

    public sendTouch(gestureName: string) {
        const msg: TouchEvent = {
            type: GlassesToCloudMessageType.TOUCH_EVENT,
            device_model: "Mentra Headless",
            gesture_name: gestureName,
            timestamp: new Date(),
        };
        this.client.send(msg);
    }

    public updateHeadPosition(position: "up" | "down") {
        const msg: HeadPosition = {
            type: GlassesToCloudMessageType.HEAD_POSITION,
            position,
        };
        this.client.send(msg);
    }

    public setVadStatus(isSpeaking: boolean) {
        const msg: Vad = {
            type: GlassesToCloudMessageType.VAD,
            status: isSpeaking,
        };
        this.client.send(msg);
    }
}
