import SearchIcon from "assets/icons/SearchIcon";
import * as React from "react";
import {Text, StyleSheet, View, Pressable} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";

const ListHeaderIcon = () => {
  	
  	return (
    		<SafeAreaView style={styles.listHeaderIcon}>
      			<View style={styles.tableHeader}>
        				<Text style={styles.inactiveApps}>Active Apps</Text>
      			</View>
      			<Pressable style={styles.wrapper} onPress={()=>{}}>
        				<SearchIcon/>
      			</Pressable>
    		</SafeAreaView>);
};

const styles = StyleSheet.create({
  	inactiveApps: {
    		fontSize: 15,
    		letterSpacing: 0.6,
    		lineHeight: 20,
    		fontWeight: "500",
    		fontFamily: "SF Pro Rounded",
    		color: "#fff",
    		textAlign: "left"
  	},
  	tableHeader: {
    		flexDirection: "row"
  	},
  
  	wrapper: {
    		width: 24,
    		height: 20
  	},
  	listHeaderIcon: {
		marginBottom:12,
    		flex: 1,
    		alignItems: "center",
    		justifyContent: "space-between",
    		paddingVertical: 0,
    		gap: 0,
    		flexDirection: "row",
    		width: "100%"
  	}
});

export default ListHeaderIcon;
