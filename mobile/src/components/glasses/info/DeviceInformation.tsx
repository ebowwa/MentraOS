import InfoSection from "@/components/ui/InfoSection"
import {useCoreStatus} from "@/contexts/CoreStatusProvider"

export function DeviceInformation() {
  const {status} = useCoreStatus()
  const bluetoothName = status.glasses_info?.bluetooth_name
  const buildNumber = status.glasses_info?.glasses_build_number
  const localIpAddress = status.glasses_info?.glasses_wifi_local_ip

  return (
    <InfoSection
      title="Device Information"
      items={[
        {label: "Bluetooth Name", value: bluetoothName},
        {label: "Build Number", value: buildNumber},
        {label: "Local IP Address", value: localIpAddress},
      ]}
    />
  )
}
