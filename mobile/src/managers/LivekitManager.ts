import {Room, RoomEvent, ConnectionState} from "livekit-client"
import restComms from "@/managers/RestComms"

class LivekitManager {
  private static instance: LivekitManager
  private room: Room | null = null

  private sequence = 0

  private constructor() {}

  public static getInstance(): LivekitManager {
    if (!LivekitManager.instance) {
      LivekitManager.instance = new LivekitManager()
    }
    return LivekitManager.instance
  }

  private getSequence() {
    this.sequence += 1
    this.sequence = this.sequence % 256
    return this.sequence
  }

  public async connect() {
    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }

    try {
      const {url, token} = await restComms.getLivekitUrlAndToken()
      console.log(`LivekitManager: Connecting to room: ${url}, ${token}`)
      this.room = new Room()
      await this.room.connect(url, token)
      this.room.on(RoomEvent.Connected, () => {
        console.log("LivekitManager: Connected to room")
      })
      this.room.on(RoomEvent.Disconnected, () => {
        console.log("LivekitManager: Disconnected from room")
      })
    } catch (error) {
      console.error("LivekitManager: Error connecting to room", error)
    }
  }

  public async addPcm(data: Uint8Array) {
    if (!this.room || this.room.state !== ConnectionState.Connected) {
      console.log("LivekitManager: Room not connected")
      return
    }

    // prepend a sequence number:
    data = new Uint8Array([this.getSequence(), ...data])

    this.room?.localParticipant.publishData(data, {reliable: false})
  }

  async disconnect() {
    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }
  }
}

const livekitManager = LivekitManager.getInstance()
export default livekitManager
