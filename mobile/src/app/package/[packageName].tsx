// loading screen with a spinner

import {View, Text, ActivityIndicator} from "react-native"

export default function LoadingScreen() {
  return (
    <View style={{flex: 1, justifyContent: "center", alignItems: "center"}}>
      <ActivityIndicator size="large" color="#00ff00" />
    </View>
  )
}
