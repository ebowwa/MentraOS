export const MOCK_CONNECTION: boolean = false
export const INTENSE_LOGGING: boolean = false
export const enable_phone_notifications_DEFAULT: boolean = true

// export const DeviceTypes = {
//   SIMULATED: "Simulated Glasses",
//   G1: "Even Realities G1",
//   LIVE: "Mentra Live",
//   MACH1: "Mentra Mach1",
//   Z100: "Vuzix Z100",
//   NEX: "Mentra Nex",
//   FRAME: "Brilliant Frame",
//   get ALL() {
//     return [this.SIMULATED, this.G1, this.MACH1, this.LIVE, this.Z100, this.NEX, this.FRAME]
//   },
// } as const

export const ConnTypes = {
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
} as const
