import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  TrackReferenceOrPlaceholder,
  VideoTrack,
  isTrackReference,
  registerGlobals,
} from "@livekit/react-native"

import {Room, LocalAudioTrack, Track, AudioPreset} from "livekit-client"
import Toast from "react-native-toast-message"

class LivekitManager {
  private static instance: LivekitManager
  private room: Room | null = null

  private static sequence = 0

  private constructor() {}

  private static getSequence() {
    LivekitManager.sequence += 1
    LivekitManager.sequence = LivekitManager.sequence % 256
    return LivekitManager.sequence
  }

  public static getInstance(): LivekitManager {
    if (!LivekitManager.instance) {
      LivekitManager.instance = new LivekitManager()
    }
    return LivekitManager.instance
  }

  public async connect(url: string, token: string) {
    // const room = new LiveKitRoom({
    //   url,
    //   token,
    // })

    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }

    try {
      console.log(`LivekitManager: Connecting to room`)
      const room = new Room()
      this.room = room
      await room.connect(url, token)
      // room.on("connected", () => {
      //   console.log("LivekitManager: Connected to room")
      // })
      // room.on("reconnected", () => {
      //   console.log("LivekitManager: Reconnected to room")
      // })
      room.on("disconnected", () => {
        console.log("LivekitManager: Disconnected from room")
      })
      // setInterval(() => {
      //   console.log("LivekitManager: Room state", this.room?.state)
      // }, 1000)
    } catch (error) {
      console.error("LivekitManager: Error connecting to room", error)
    }
  }

  public async addPcm(data: Uint8Array) {
    if (!this.room) {
      console.log("LivekitManager: Room not connected")
      return
    }

    // if (Math.random() < 0.01) {
    // console.log(`LivekitManager: Adding PCM data to room, ${data.length} bytes`)
    // }

    // prepend a sequence number:
    const sequence = LivekitManager.getSequence()
    data = new Uint8Array([sequence, ...data])

    // console.error(`number: ${sequence}`)
    Toast.show({
      text1: `number: ${sequence}`,
      type: "error",
    })

    this.room?.localParticipant.publishData(data, {reliable: false})
    // socketComms.sendBinary(data)
  }
}

const livekitManager = LivekitManager.getInstance()
export default livekitManager
