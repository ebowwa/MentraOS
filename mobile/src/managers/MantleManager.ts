import socketComms from "@/managers/SocketComms"
import * as Calendar from "expo-calendar"
import restComms from "@/managers/RestComms"
import * as TaskManager from "expo-task-manager"
import * as Location from "expo-location"
import TranscriptProcessor from "@/utils/TranscriptProcessor"
import {useSettingsStore, SETTINGS_KEYS} from "@/stores/settings"
import bridge from "@/bridge/MantleBridge"

const LOCATION_TASK_NAME = "handleLocationUpdates"

TaskManager.defineTask(LOCATION_TASK_NAME, ({data: {locations}, error}) => {
  if (error) {
    // check `error.message` for more details.
    console.error("Error handling location updates", error)
    return
  }
  const locs = locations as Location.LocationObject[]
  if (locs.length === 0) {
    console.log("Mantle: LOCATION: No locations received")
    return
  }

  console.log("Received new locations", locations)
  const first = locs[0]!
  socketComms.sendLocationUpdate(first.coords.latitude, first.coords.longitude, first.coords.accuracy ?? undefined)
})

class MantleManager {
  private static instance: MantleManager | null = null

  private calendarSyncTimer: NodeJS.Timeout | null = null
  private transcriptProcessor: TranscriptProcessor
  private clearTextTimeout: NodeJS.Timeout | null = null
  private readonly MAX_CHARS_PER_LINE = 30
  private readonly MAX_LINES = 3

  public static getInstance(): MantleManager {
    if (!MantleManager.instance) {
      MantleManager.instance = new MantleManager()
    }
    return MantleManager.instance
  }

  private constructor() {
    this.transcriptProcessor = new TranscriptProcessor(this.MAX_CHARS_PER_LINE, this.MAX_LINES)
  }

  // run at app start on the init.tsx screen:
  // should only ever be run once
  public async init() {
    try {
      const loadedSettings = await restComms.loadUserSettings() // get settings from server
      await useSettingsStore.getState().setManyLocally(loadedSettings) // write settings to local storage
      await useSettingsStore.getState().initUserSettings() // initialize user settings
    } catch (e) {
      console.error(`Failed to get settings from server: ${e}`)
    }
    await bridge.updateSettings(useSettingsStore.getState().getCoreSettings()) // send settings to core
    this.setupPeriodicTasks()
  }

  public cleanup() {
    // Stop timers
    if (this.calendarSyncTimer) {
      clearInterval(this.calendarSyncTimer)
      this.calendarSyncTimer = null
    }
    Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
    this.transcriptProcessor.clear()
  }

  private async setupPeriodicTasks() {
    this.sendCalendarEvents()
    // Calendar sync every hour
    this.calendarSyncTimer = setInterval(
      () => {
        this.sendCalendarEvents()
      },
      60 * 60 * 1000,
    ) // 1 hour
    try {
      let locationAccuracy = await useSettingsStore.getState().loadSetting(SETTINGS_KEYS.location_tier)
      let properAccuracy = this.getLocationAccuracy(locationAccuracy)
      Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: properAccuracy,
      })
    } catch (error) {
      console.error("Mantle: Error starting location updates", error)
    }
  }

  private async sendCalendarEvents() {
    try {
      console.log("Mantle: sendCalendarEvents()")
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
      const calendarIds = calendars.map((calendar: Calendar.Calendar) => calendar.id)
      // from 2 hours ago to 1 week from now:
      const startDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
      const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate)
      restComms.sendCalendarData({events, calendars})
    } catch (error) {
      // it's fine if this fails
      console.log("Mantle: Error sending calendar events", error)
    }
  }

  private async sendLocationUpdates() {
    console.log("Mantle: sendLocationUpdates()")
    // const location = await Location.getCurrentPositionAsync()
    // socketComms.sendLocationUpdate(location)
  }

  public getLocationAccuracy(accuracy: string) {
    switch (accuracy) {
      case "realtime":
        return Location.LocationAccuracy.BestForNavigation
      case "tenMeters":
        return Location.LocationAccuracy.High
      case "hundredMeters":
        return Location.LocationAccuracy.Balanced
      case "kilometer":
        return Location.LocationAccuracy.Low
      case "threeKilometers":
        return Location.LocationAccuracy.Lowest
      case "reduced":
        return Location.LocationAccuracy.Lowest
      default:
        // console.error("Mantle: unknown accuracy: " + accuracy)
        return Location.LocationAccuracy.Balanced
    }
  }

  public async setLocationTier(tier: string) {
    console.log("Mantle: setLocationTier()", tier)
    // restComms.sendLocationData({tier})
    try {
      const accuracy = this.getLocationAccuracy(tier)
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: accuracy,
        pausesUpdatesAutomatically: false,
      })
    } catch (error) {
      console.error("Mantle: Error setting location tier", error)
    }
  }

  public async requestSingleLocation(accuracy: string, correlationId: string) {
    console.log("Mantle: requestSingleLocation()")
    // restComms.sendLocationData({tier})
    try {
      const location = await Location.getCurrentPositionAsync({accuracy: this.getLocationAccuracy(accuracy)})
      socketComms.sendLocationUpdate(
        location.coords.latitude,
        location.coords.longitude,
        location.coords.accuracy ?? undefined,
        correlationId,
      )
    } catch (error) {
      console.error("Mantle: Error requesting single location", error)
    }
  }

  public async handleLocalTranscription(data: any) {
    // TODO: performance!
    const offlineStt = await useSettingsStore.getState().loadSetting(SETTINGS_KEYS.offline_captions_app_running)
    if (offlineStt) {
      this.transcriptProcessor.changeLanguage(data.transcribeLanguage)
      const processedText = this.transcriptProcessor.processString(data.text, data.isFinal ?? false)

      // Scheduling timeout to clear text from wall. In case of online STT online dashboard manager will handle it.
      if (data.isFinal) {
        console.log("Mantle: isFinal, scheduling timeout to clear text from wall")
        if (this.clearTextTimeout) {
          console.log("Mantle: canceling pending timeout")
          clearTimeout(this.clearTextTimeout)
        }
        this.clearTextTimeout = setTimeout(() => {
          console.log("Mantle: clearing text from wall")
          socketComms.handle_display_event({
            type: "display_event",
            view: "main",
            layout: {
              layoutType: "text_wall",
              text: "",
            },
          })
        }, 10000) // 10 seconds
      }

      if (processedText) {
        socketComms.handle_display_event({
          type: "display_event",
          view: "main",
          layout: {
            layoutType: "text_wall",
            text: processedText,
          },
        })
      }

      return
    }

    if (socketComms.isWebSocketConnected()) {
      socketComms.sendLocalTranscription(data)
      return
    }
  }
}

const mantle = MantleManager.getInstance()
export default mantle
