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
import socketComms from "./SocketComms"

class LivekitManager {
  private static instance: LivekitManager
  private room: Room | null = null

  private constructor() {
    // this.livekit = new Livekit()
  }

  public static getInstance(): LivekitManager {
    if (!LivekitManager.instance) {
      LivekitManager.instance = new LivekitManager()
    }
    return LivekitManager.instance
  }

  public connect(url: string, token: string) {
    // const room = new LiveKitRoom({
    //   url,
    //   token,
    // })
    const room = new Room()
    this.room = room
    room.connect(url, token)
    room.on("connected", () => {
      console.log("LivekitManager: Connected to room")
    })
    room.on("disconnected", () => {
      console.log("LivekitManager: Disconnected from room")
    })
  }

  public async addPcm(data: Uint8Array) {
    console.log("LivekitManager: Test")

    if (!this.room) {
      console.log("LivekitManager: Room not connected")
      return
    }

    this.room.localParticipant.publishData(data, {reliable: false})
    // socketComms.sendBinary(data)
  }
}

const livekitManager = LivekitManager.getInstance()
export default livekitManager
