import {Text, Icon} from "@/components/ignite"
import {useAppTheme} from "@/utils/useAppTheme"
import {ThemedStyle} from "@/theme"
import {View, TextStyle, ViewStyle} from "react-native"
import {GlassesIcon} from "./GlassesIcon"
import {CaseIcon} from "./CaseIcon"

interface BatteryStatusProps {
  glassesBatteryLevel?: number
  caseBatteryLevel?: number
  caseCharging?: boolean
  caseRemoved?: boolean
}

export function BatteryStatus({glassesBatteryLevel, caseBatteryLevel, caseCharging, caseRemoved}: BatteryStatusProps) {
  const {theme, themed} = useAppTheme()

  if (glassesBatteryLevel === undefined || glassesBatteryLevel === -1) {
    return null
  }

  return (
    <View style={themed($container)}>
      <Text tx="deviceSettings:batteryStatus" style={[themed($subtitle), {marginBottom: theme.spacing.xs}]} />

      {/* Glasses Battery */}
      {glassesBatteryLevel !== -1 && (
        <View style={themed($batteryRow)}>
          <View style={themed($batteryLabel)}>
            <GlassesIcon size={20} isDark={theme.isDark} />
            <Text tx="deviceSettings:glasses" style={{color: theme.colors.text}} />
          </View>
          <View style={themed($batteryValue)}>
            <Icon icon="battery" size={16} color={theme.colors.text} />
            <Text style={{color: theme.colors.text, marginLeft: 4, fontWeight: "500"}}>{glassesBatteryLevel}%</Text>
          </View>
        </View>
      )}

      {/* Case Battery */}
      {caseBatteryLevel !== undefined && caseBatteryLevel !== -1 && !caseRemoved && (
        <View style={themed($batteryRow)}>
          <View style={themed($batteryLabel)}>
            <CaseIcon size={20} isCharging={caseCharging} isDark={theme.isDark} />

            <Text style={{color: theme.colors.text}}>
              {caseCharging ? <Text tx="deviceSettings:caseCharging" /> : <Text tx="deviceSettings:case" />}
            </Text>
          </View>
          <View style={themed($batteryValue)}>
            <Icon icon="battery" size={16} color={theme.colors.text} />
            <Text style={{color: theme.colors.text, fontWeight: "500"}}>{caseBatteryLevel}%</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const $container: ThemedStyle<ViewStyle> = ({colors, spacing}) => ({
  backgroundColor: colors.backgroundAlt,
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: spacing.md,
  borderWidth: 2,
  borderColor: colors.border,
})

const $subtitle: ThemedStyle<TextStyle> = ({colors, spacing}) => ({
  color: colors.textDim,
  fontSize: spacing.sm,
})

const $batteryRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 4,
})

const $batteryLabel: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $batteryValue: ThemedStyle<ViewStyle> = ({spacing}) => ({
  flexDirection: "row",
  alignItems: "center",
  width: spacing.xxxl,
  justifyContent: "space-between",
})
