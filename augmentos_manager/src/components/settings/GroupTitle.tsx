import {useAppTheme} from "@/utils/useAppTheme"
import React from "react"
import {View, Text, StyleSheet} from "react-native"

type GroupTitleProps = {
  title: string
}

const GroupTitle: React.FC<GroupTitleProps> = ({title}) => {
  const {theme, themed} = useAppTheme()
  return (
    <View style={styles.container}>
      <Text style={[styles.title, {color: theme.colors.text}]}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 15,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
})

export default GroupTitle
