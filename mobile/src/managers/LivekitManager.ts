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
import restComms from "./RestComms"

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
    console.log(`LivekitManager: Connecting to room`)

    // const room = new LiveKitRoom({
    //   url,
    //   token,
    // })

    if (this.room) {
      await this.room.disconnect()
      this.room = null
    }

    try {
      const {url, token} = await restComms.getLivekitUrlAndToken()

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

    // setTimeout(() => {
    //   this.connect()
    // }, 20 * 1000)
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
    const sequence = this.getSequence()
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
