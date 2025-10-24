struct DeviceTypes {
    static let SIMULATED = "Simulated Glasses"
    static let G1 = "Even Realities G1"
    static let LIVE = "Mentra Live"
    static let NEX = "Mentra Nex"
    static let FRAME = "Brilliant Frame"

    static let ALL = [
        SIMULATED,
        G1,
        LIVE,
        NEX,
        FRAME,
    ]

    // Private init to prevent instantiation
    private init() {}
}

struct ConnTypes {
    static let CONNECTING = "CONNECTING"
    static let CONNECTED = "CONNECTED"
    static let DISCONNECTED = "DISCONNECTED"

    // Private init to prevent instantiation
    private init() {}
}
