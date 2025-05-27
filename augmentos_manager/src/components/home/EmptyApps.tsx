import * as React from "react";
import {Text, StyleSheet} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";

const EmptyApps = () => {
  	
  	return (
    		<SafeAreaView style={styles.emptyApps}>
      			<Text style={[styles.statusMessage, styles.messageFlexBox]} numberOfLines={1}>No Active Apps</Text>
      			<Text style={[styles.activeAppsMessage, styles.messageFlexBox]} numberOfLines={1}>Your active apps will appear here.</Text>
    		</SafeAreaView>);
};

const styles = StyleSheet.create({
  	messageFlexBox: {
    		overflow: "hidden",
    		textAlign: "left"
  	},
  	statusMessage: {
    		fontSize: 17,
    		letterSpacing: 1.7,
    		textTransform: "capitalize",
    		fontFamily: "SF Pro Rounded",
    		color: "#b0b9ff"
  	},
  	activeAppsMessage: {
    		fontSize: 13,
    		letterSpacing: 0.4,
    		lineHeight: 18,
    		fontFamily: "Inter-Regular",
    		color: "#898fb2"
  	},
  	emptyApps: {
    		alignSelf: "stretch",
    		borderRadius: 15,
    		flex: 1,
    		width: "100%",
    		alignItems: "center",
    		justifyContent: "center",
    		paddingHorizontal: 12,
    		paddingVertical: 24,
    		gap: 12
  	}
});

export default EmptyApps;
