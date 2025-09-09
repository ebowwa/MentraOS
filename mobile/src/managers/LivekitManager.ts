import {
  AudioSession,
  LiveKitRoom,
  useTracks,
  TrackReferenceOrPlaceholder,
  VideoTrack,
  isTrackReference,
  registerGlobals,
} from "@livekit/react-native"

import {Room} from "livekit-client"
import {Track} from "livekit-client"

class LivekitManager {
  private static instance: LivekitManager

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
    room.connect(url, token)
    room.on("connected", () => {
      console.log("LivekitManager: Connected to room")
    })
    room.on("disconnected", () => {
      console.log("LivekitManager: Disconnected from room")
    })
  }
}

const livekitManager = LivekitManager.getInstance()
export default livekitManager
