import {useAppTheme} from "@/utils/useAppTheme"
import React from "react"
import {View, Text, StyleSheet} from "react-native"

type GroupTitleProps = {
  title: string
}

const GroupTitle: React.FC<GroupTitleProps> = ({title}) => {
  const {theme, themed} = useAppTheme()
  return (
    <View style={[
      styles.container, 
      {
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
      }
    ]}>
      <Text style={[styles.title, {color: theme.colors.textDim}]}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  title: {
    fontSize: 16,
    fontWeight: "normal",
    fontFamily: "Montserrat-Regular",
  },
})

export default GroupTitle
