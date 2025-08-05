import {View} from "react-native"

export const DebugHitSlop = ({children, hitSlop, style, ...props}) => {
  if (!__DEV__ || !hitSlop) return children

  const hitSlopStyle = {
    position: "absolute",
    top: -(hitSlop.top || hitSlop || 0),
    bottom: -(hitSlop.bottom || hitSlop || 0),
    left: -(hitSlop.left || hitSlop || 0),
    right: -(hitSlop.right || hitSlop || 0),
    borderWidth: 1,
    borderColor: "rgba(255, 0, 0, 0.5)",
    borderStyle: "dashed",
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    pointerEvents: "none",
  }

  return (
    <View style={style}>
      {children}
      <View style={hitSlopStyle} />
    </View>
  )
}
