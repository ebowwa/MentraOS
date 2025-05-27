import * as React from "react";
import {StyleSheet, Text, View, Image, TouchableOpacity} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import ChevronRight from "assets/icons/ChevronRight"

interface ButtonProps {
  title: string;
  onPress: () => void;
  icon: React.ReactNode;
}

const Button = ({ title, onPress, icon }: ButtonProps) => {
  	
  	return (
    		<TouchableOpacity onPress={onPress} style={styles.padding}>
        				<View style={[styles.insideSpacing, styles.insideFlexBox]}>
          					<View style={[styles.inside, styles.insideFlexBox]}>
            						{icon}
            						<View style={[styles.miraWrapper, styles.insideFlexBox]}>
              							<Text style={styles.mira} numberOfLines={1}>{title}</Text>
            						</View>
          					</View>
          					<ChevronRight/>
        				</View>
      			</TouchableOpacity>);
};

const styles = StyleSheet.create({
  	insideFlexBox: {
    		flexDirection: "row",
    		alignItems: "center"
  	},
  	solarLineIconsSet3: {
    		overflow: "hidden"
  	},
  	mira: {
    		fontSize: 17,
    		letterSpacing: 0.3,
    		lineHeight: 23,
    		fontWeight: "500",
    		fontFamily: "JosefinSans-Medium",
    		color: "#fff",
    		textAlign: "center",
    		overflow: "hidden"
  	},
  	miraWrapper: {
    		width: 265
  	},
  	inside: {
    		gap: 20
  	},
  	insideSpacing: {
    		borderRadius: 30,
    		backgroundColor: "#0f1861",
    		borderStyle: "solid",
    		borderColor: "#06114d",
    		borderWidth: 2,
    		width: "100%",
    		height: 44,
    		justifyContent: "space-between",
    		paddingHorizontal: 16,
    		paddingVertical: 8,
    		gap: 0,
    		overflow: "hidden"
  	},
  	padding: {
    		paddingHorizontal: 8,
    		paddingVertical: 16,
			marginVertical: 8
  	},
  	quickConnect: {
    		flex: 1,
    		width: "100%",
    		alignItems: "center",
    		overflow: "hidden"
  	}
});

export default Button;
