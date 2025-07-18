import Config from "react-native-config"

export function debugConfig() {
  console.log("=== React Native Config Debug ===")
  console.log("All Config values:", Config)
  console.log("MENTRAOS_HOST:", Config.MENTRAOS_HOST)
  console.log("MENTRAOS_PORT:", Config.MENTRAOS_PORT)
  console.log("MENTRAOS_SECURE:", Config.MENTRAOS_SECURE)
  console.log("MENTRAOS_VERSION:", Config.MENTRAOS_VERSION)
  console.log("MENTRAOS_APPSTORE_URL:", Config.MENTRAOS_APPSTORE_URL)
  console.log("================================")
}
