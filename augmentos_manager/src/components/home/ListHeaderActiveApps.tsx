import SearchIcon from "assets/icons/SearchIcon";
import * as React from "react";
import {Text, View, Pressable, TextStyle, ViewStyle} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import { translate } from "@/i18n";
import {ThemedStyle} from "@/theme"
import {useAppTheme} from "@/utils/useAppTheme"

const ListHeaderIcon = () => {
  	const {themed, theme} = useAppTheme()

  	return (
    		<SafeAreaView style={themed($listHeaderIcon)}>
      			<View style={themed($tableHeader)}>
        				<Text style={themed($activeApps)}>{translate("home:activeApps")}</Text>
      			</View>
      			<Pressable style={themed($wrapper)} onPress={()=>{
              //TODO implement search
              console.log("SearchButton: Not implemented yet");
            }}>
        				<SearchIcon/>
      			</Pressable>
    		</SafeAreaView>);
};

const $activeApps: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  letterSpacing: 0.6,
  lineHeight: 20,
  fontWeight: "500",
  fontFamily: "SF Pro Rounded",
  color: "#fff",
  textAlign: "left",
});

const $tableHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
});

const $wrapper: ThemedStyle<ViewStyle> = () => ({
  width: 24,
  height: 20,
});

const $listHeaderIcon: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 12,
  flex: 1,
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: 0,
  gap: 0,
  flexDirection: "row",
  width: "100%",
});

export default ListHeaderIcon;
