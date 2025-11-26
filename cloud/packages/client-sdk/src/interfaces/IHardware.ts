export interface IHardware {
    /**
     * Simulate a button press
     * @param buttonId ID of the button
     * @param type Type of press (short, long)
     */
    pressButton(buttonId: string, type?: "short" | "long"): void;

    /**
     * Simulate a touch gesture
     * @param gesture Gesture name
     */
    sendTouch(gesture: string): void;

    /**
     * Update head position
     * @param position Position identifier
     */
    updateHeadPosition(position: string): void;

    /**
     * Register a callback for hardware events
     */
    onEvent(callback: (event: any) => void): void;
}
