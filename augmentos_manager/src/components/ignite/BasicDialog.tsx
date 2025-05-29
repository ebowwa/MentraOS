import AppleIcon from "assets/icons/AppleIcon";
import * as React from "react";
import {StyleSheet, Text, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
interface BasicDialogProps {
  title: string;
  description?: string | React.ReactNode;
  icon?: React.ReactNode;
  leftButtonText?: string;
  rightButtonText: string;
  onLeftPress?: () => void;
  onRightPress: () => void;
}

const BasicDialog = ({
  title,
  description,
  icon,
  leftButtonText,
  rightButtonText,
  onLeftPress,
  onRightPress
}: BasicDialogProps) => {
  return (
    <View style={[styles.basicDialog, styles.basicDialogFlexBox]}>
      <View style={[styles.titleDescription, styles.basicDialogFlexBox]}>
        {icon}
        {title && <Text style={[styles.headline, styles.labelTypo1]}>{title}</Text>}
        {description && (
          <Text style={[styles.defaulttext, styles.labelTypo]}>
            {description}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        <View style={[styles.actions1, styles.actions1FlexBox]}>
          {leftButtonText && (
            <View style={[styles.secondaryButton, styles.actions1FlexBox]}>
              <View style={[styles.content, styles.contentFlexBox]}>
                <View style={[styles.stateLayer, styles.actions1FlexBox]}>
                  <Text style={[styles.label, styles.labelTypo]} onPress={onLeftPress}>{leftButtonText}</Text>
                </View>
              </View>
            </View>
          )}
          <View style={[styles.secondaryButton, styles.actions1FlexBox]}>
            <View style={[styles.content1, styles.contentFlexBox]}>
              <View style={[styles.stateLayer, styles.actions1FlexBox]}>
                <Text style={[styles.label1, styles.labelTypo]} onPress={onRightPress}>{rightButtonText}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  	basicDialogFlexBox: {
    		alignItems: "center",
    		justifyContent: "center",
    		overflow: "hidden"
  	},
  	labelTypo1: {
    		color: "#f9f8fe",
    		fontWeight: "500",
    		letterSpacing: 1.7,
    		fontSize: 17
  	},
  	labelTypo: {
    		textAlign: "left",
    		fontFamily: "SF Pro Rounded"
  	},
  	actions1FlexBox: {
    		flexDirection: "row",
    		alignItems: "center"
  	},
  	contentFlexBox: {
    		borderRadius: 100,
    		justifyContent: "center",
    		alignItems: "center",
    		overflow: "hidden"
  	},
  
  	headline: {
    		textAlign: "center",
    		fontFamily: "SF Pro Rounded",
    		color: "#f9f8fe",
    		alignSelf: "stretch"
  	},
  	defaulttext: {
    		color: "#d5d8f5"
  	},
  	oneForeground: {
    		color: "#abaaff"
  	},
  	supportingText: {
    		fontSize: 15,
    		letterSpacing: 0.6,
    		lineHeight: 20,
    		alignSelf: "stretch"
  	},
  	titleDescription: {
    		paddingHorizontal: 24,
    		paddingTop: 24,
    		gap: 16,
    		alignSelf: "stretch",
    		justifyContent: "center"
  	},
  	label: {
    		color: "#f9f8fe",
    		fontWeight: "500",
    		letterSpacing: 1.7,
    		fontSize: 17
  	},
  	stateLayer: {
    		paddingHorizontal: 16,
    		paddingVertical: 10,
    		justifyContent: "center"
  	},
  	content: {
    		borderStyle: "solid",
    		borderColor: "#747cab",
    		borderWidth: 1
  	},
  	secondaryButton: {
    		height: 48,
    		justifyContent: "center"
  	},
  	label1: {
    		color: "#141434",
    		fontWeight: "500",
    		letterSpacing: 1.7,
    		fontSize: 17,
    		textAlign: "left"
  	},
  	content1: {
    		backgroundColor: "#b0b9ff"
  	},
  	actions1: {
    		paddingLeft: 8,
    		paddingTop: 20,
    		paddingRight: 24,
    		paddingBottom: 20,
    		gap: 8,
    		overflow: "hidden"
  	},
  	actions: {
    		alignItems: "flex-end",
    		alignSelf: "stretch",
    		overflow: "hidden"
  	},
  	basicDialog: {
    		shadowColor: "rgba(0, 0, 0, 0.25)",
    		shadowOffset: {
      			width: 0,
      			height: 4
    		},
    		shadowRadius: 4,
    		elevation: 4,
    		shadowOpacity: 1,
    		borderRadius: 28,
    		backgroundColor: "#141834",
    		flex: 1,
    		width: "90%",
    		minWidth: "50%",
    		maxWidth: "90%",
    		justifyContent: "center"
  	}
});

export default BasicDialog;
