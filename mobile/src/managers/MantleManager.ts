import socketComms from "@/managers/SocketComms"
import settings, {SETTINGS_KEYS} from "@/managers/Settings"
import * as Calendar from "expo-calendar"
import restComms from "@/managers/RestComms"
import * as TaskManager from "expo-task-manager"
import * as Location from "expo-location"

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

  public static getInstance(): MantleManager {
    if (!MantleManager.instance) {
      MantleManager.instance = new MantleManager()
    }
    return MantleManager.instance
  }

  private constructor() {}

  public init() {
    this.setupPeriodicTasks()
  }

  public cleanup() {
    // Stop timers
    if (this.calendarSyncTimer) {
      clearInterval(this.calendarSyncTimer)
      this.calendarSyncTimer = null
    }
    Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
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
      let locationAccuracy = await settings.get(SETTINGS_KEYS.location_tier)
      let properAccuracy = this.getLocationAccuracy(locationAccuracy)
      Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: properAccuracy,
      })
    } catch (error) {
      console.error("Mantle: Error starting location updates", error)
    }
  }

  private async sendCalendarEvents() {
    console.log("Mantle: sendCalendarEvents()")
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    const calendarIds = calendars.map((calendar: Calendar.Calendar) => calendar.id)
    // from 2 hours ago to 1 week from now:
    const startDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate)
    restComms.sendCalendarData({events, calendars})
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
        return Location.LocationAccuracy.Lowest
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
    console.log("Mantle: handleLocalTranscription()", data)
    // TODO: performance!
    const offlineStt = await settings.get(SETTINGS_KEYS.offline_stt)
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

    if (socketComms.isWebSocketConnected()) {
      socketComms.sendLocalTranscription(data)
      return
    }
  }
}

const mantle = MantleManager.getInstance()
export default mantle
