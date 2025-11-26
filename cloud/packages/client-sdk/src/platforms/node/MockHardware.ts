import EventEmitter from "eventemitter3";
import { IHardware } from "../../interfaces/IHardware";

export class MockHardware implements IHardware {
    private emitter = new EventEmitter();

    pressButton(buttonId: string, type: "short" | "long" = "short"): void {
        console.log(`[MockHardware] Button Pressed: ${buttonId} (${type})`);
        this.emitter.emit("event", { type: "button", buttonId, pressType: type });
    }

    sendTouch(gesture: string): void {
        console.log(`[MockHardware] Touch Gesture: ${gesture}`);
        this.emitter.emit("event", { type: "touch", gesture });
    }

    updateHeadPosition(position: string): void {
        console.log(`[MockHardware] Head Position: ${position}`);
        this.emitter.emit("event", { type: "head", position });
    }

    onEvent(callback: (event: any) => void): void {
        this.emitter.on("event", callback);
    }
}
