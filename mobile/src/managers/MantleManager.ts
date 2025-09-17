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
    // TODO: performance!
    const offlineStt = await loadSetting(SETTINGS_KEYS.offline_stt)
    if (offlineStt) {
      socketComms.handle_display_event({
        type: "display_event",
        view: "main",
        layout: {
          layoutType: "text_wall",
          text: data.text,
        },
      })
      return
    }

    if (socketComms.isConnected()) {
      socketComms.sendTranscriptionResult(data)
      return
    }
  }
}

const mantle = MantleManager.getInstance()
export default mantle
