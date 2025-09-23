// import {Audio} from "expo-av"
import socketComms from "@/managers/SocketComms"
import {AudioPlayer, createAudioPlayer} from "expo-audio"

export interface AudioPlayRequestMessage {
  type: "audio_play_request"
  requestId: string
  audioUrl: string
  volume?: number
  stopOtherAudio?: boolean
}

export interface AudioPlayResponse {
  requestId: string
  success: boolean
  error?: string
  duration?: number
}

export type AudioPlayResponseCallback = (response: AudioPlayResponse) => void

export class AudioPlayService {
  private static instance: AudioPlayService
  private player: AudioPlayer

  private constructor() {
    this.player = createAudioPlayer()
  }

  public static getInstance(): AudioPlayService {
    if (!AudioPlayService.instance) {
      AudioPlayService.instance = new AudioPlayService()
    }
    return AudioPlayService.instance
  }

  //   func sendAudioPlayResponse(requestId: String, success: Bool, error: String? = nil, duration: Double? = nil) {
  //     Bridge.log("ServerComms: Sending audio play response - requestId: \(requestId), success: \(success), error: \(error ?? "none")")
  //     let message: [String: Any] = [
  //         "type": "audio_play_response",
  //         "requestId": requestId,
  //         "success": success,
  //         "error": error as Any,
  //         "duration": duration as Any,
  //     ].compactMapValues { $0 }

  //     do {
  //         let jsonData = try JSONSerialization.data(withJSONObject: message)
  //         if let jsonString = String(data: jsonData, encoding: .utf8) {
  //             wsManager.sendText(jsonString)
  //             Bridge.log("ServerComms: Sent audio play response to server")
  //         }
  //     } catch {
  //         Bridge.log("ServerComms: Failed to serialize audio play response: \(error)")
  //     }
  // }

  public async handle_audio_play_request(msg: any) {
    const {requestId, audioUrl} = msg

    const player = createAudioPlayer(audioUrl)

    // Set up a listener for playback status updates
    const subscription = player.addListener("playbackStatusUpdate", status => {
      // Check if the audio just finished playing
      if (status.didJustFinish) {
        console.log(`Request ${requestId} finished playing`)
        socketComms.sendAudioPlayResponse(requestId, true, null, 1000)

        // Clean up: remove listener and release the player
        subscription.remove()
        player.remove()
      }
    })

    // Start playing the audio
    player.play()
  }
}

export default AudioPlayService.getInstance()
