import bridge from "@/bridge/MantleBridge"
import socketComms from "@/managers/SocketComms"
import {loadSetting, SETTINGS_KEYS} from "@/utils/SettingsHelper"

class MantleManager {
  private static instance: MantleManager | null = null

  public static getInstance(): MantleManager {
    if (!MantleManager.instance) {
      MantleManager.instance = new MantleManager()
    }
    return MantleManager.instance
  }

  private constructor() {}

  public async handleTranscriptionResult(data: any) {
    // if (socketComms.isConnected()) {
    //   socketComms.sendTranscriptionResult(data)
    //   return
    // }

    const offlineStt = await loadSetting(SETTINGS_KEYS.offline_stt)
    if (offlineStt) {
      socketComms.handle_display_event({
        view: "main",
        layoutType: "text_wall",
        text: data.text,
      })
      return
    }

    console.log("MantleManager: Transcription result: ", data)
  }
}

const mantle = MantleManager.getInstance()
export default mantle
