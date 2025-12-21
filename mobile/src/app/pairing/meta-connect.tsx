import CoreModule from "core"
import { useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import {
    ActivityIndicator,
    Image,
    ImageStyle,
    Platform,
    ScrollView,
    TextStyle,
    View,
    ViewStyle,
} from "react-native"

import { MentraLogoStandalone } from "@/components/brands/MentraLogoStandalone"
import { Button, Header, Screen, Text } from "@/components/ignite"
import { Icon } from "@/components/ignite"
import Divider from "@/components/ui/Divider"
import { useNavigationHistory } from "@/contexts/NavigationHistoryContext"
import { translate } from "@/i18n"
import { useGlassesStore } from "@/stores/glasses"
import { $styles, ThemedStyle } from "@/theme"
import { useAppTheme } from "@/utils/useAppTheme"

type MetaConnectionState = "initial" | "registering" | "registered" | "requesting_camera" | "ready" | "error"

export default function MetaConnectScreen() {
    const { glassesModelName }: { glassesModelName: string } = useLocalSearchParams()
    const { theme, themed } = useAppTheme()
    const { goBack, clearHistoryAndGoHome } = useNavigationHistory()
    const glassesConnected = useGlassesStore(state => state.connected)

    const [connectionState, setConnectionState] = useState<MetaConnectionState>("initial")
    const [errorMessage, setErrorMessage] = useState<string>("")

    // Handle successful connection
    useEffect(() => {
        if (glassesConnected) {
            clearHistoryAndGoHome()
        }
    }, [glassesConnected])

    // Listen for Meta registration state changes from native
    useEffect(() => {
        // The native CoreModule will emit events when Meta registration state changes
        // For now, we'll use a simple approach - the native side updates the connectionState

        // TODO: Add event listener for META_REGISTRATION_STATE_CHANGED
        // GlobalEventEmitter.on("META_REGISTRATION_STATE_CHANGED", handleStateChange)

        return () => {
            // Cleanup
        }
    }, [])

    const handleConnectPress = useCallback(async () => {
        setConnectionState("registering")
        setErrorMessage("")

        try {
            // This will trigger the Meta AI app to open for registration
            console.log("Starting Meta glasses registration...")
            await CoreModule.findCompatibleDevices(glassesModelName)

            // Note: The actual state change to "registered" will come from the native side
            // via URL callback when Meta AI app returns
        } catch (error) {
            console.error("Failed to start Meta registration:", error)
            setConnectionState("error")
            setErrorMessage("Failed to connect. Please try again.")
        }
    }, [glassesModelName])

    const handleRetry = useCallback(() => {
        setConnectionState("initial")
        setErrorMessage("")
    }, [])

    const renderContent = () => {
        switch (connectionState) {
            case "initial":
                return (
                    <>
                        <View style={themed($tipContainer)}>
                            <TipItem
                                icon="video"
                                title="Video Capture"
                                description="Record videos directly from your glasses, from your point of view."
                            />
                            <TipItem
                                icon="volume-2"
                                title="Open-Ear Audio"
                                description="Hear notifications while keeping your ears open to the world around you."
                            />
                            <TipItem
                                icon="activity"
                                title="Enjoy On-the-Go"
                                description="Stay hands-free while you move through your day."
                            />
                        </View>

                        <Divider />

                        <Text
                            style={themed($infoText)}
                            text="You'll be redirected to the Meta AI app to confirm your connection."
                        />

                        <Button
                            preset="primary"
                            text="Connect with Meta AI"
                            onPress={handleConnectPress}
                            style={themed($connectButton)}
                        />
                    </>
                )

            case "registering":
                return (
                    <View style={themed($loadingContainer)}>
                        <ActivityIndicator size="large" color={theme.colors.text} />
                        <Text style={themed($loadingText)} text="Waiting for Meta AI approval..." />
                        <Text style={themed($loadingSubtext)} text="The Meta AI app should open automatically. Please approve the connection there." />

                        <Button
                            preset="secondary"
                            text="Cancel"
                            onPress={() => setConnectionState("initial")}
                            style={themed($cancelButton)}
                        />
                    </View>
                )

            case "registered":
                return (
                    <View style={themed($successContainer)}>
                        <Icon name="bluetooth-connected" size={64} color={theme.colors.text} />
                        <Text style={themed($successText)} text="Connected to Meta AI!" />
                        <Text style={themed($successSubtext)} text="Now let's set up camera access for video streaming." />

                        <Divider />

                        <View style={themed($tipContainer)}>
                            <TipItem
                                icon="camera"
                                title="Camera Permission"
                                description="Camera Access needs permission to use your glasses camera."
                            />
                            <TipItem
                                icon="eye"
                                title="LED Indicator"
                                description="The capture LED lets others know when you're capturing content."
                            />
                        </View>

                        <Button
                            preset="primary"
                            text="Grant Camera Access"
                            onPress={async () => {
                                setConnectionState("requesting_camera")
                                // This will open Meta AI app again for camera permission
                                // The native side handles this via requestPermission(.camera)
                            }}
                            style={themed($connectButton)}
                        />
                    </View>
                )

            case "requesting_camera":
                return (
                    <View style={themed($loadingContainer)}>
                        <ActivityIndicator size="large" color={theme.colors.text} />
                        <Text style={themed($loadingText)} text="Waiting for camera approval..." />
                        <Text style={themed($loadingSubtext)} text="Please grant camera access in the Meta AI app" />

                        <Button
                            preset="secondary"
                            text="Cancel"
                            onPress={() => setConnectionState("registered")}
                            style={themed($cancelButton)}
                        />
                    </View>
                )

            case "ready":
                return (
                    <View style={themed($successContainer)}>
                        <Icon name="bluetooth-connected" size={64} color={theme.colors.text} />
                        <Text style={themed($successText)} text="All set!" />
                        <Text style={themed($successSubtext)} text="Your Meta Ray-Ban glasses are ready to stream." />

                        <Button
                            preset="primary"
                            text="Start Using Glasses"
                            onPress={() => clearHistoryAndGoHome()}
                            style={themed($connectButton)}
                        />
                    </View>
                )

            case "error":
                return (
                    <View style={themed($errorContainer)}>
                        <Icon name="alert" size={64} color={theme.colors.error} />
                        <Text style={themed($errorText)} text="Connection Failed" />
                        <Text style={themed($errorSubtext)} text={errorMessage || "Unable to connect to Meta AI. Please try again."} />

                        <Button
                            preset="primary"
                            text="Try Again"
                            onPress={handleRetry}
                            style={themed($connectButton)}
                        />

                        <Button
                            preset="secondary"
                            text="Cancel"
                            onPress={() => goBack()}
                            style={themed($cancelButton)}
                        />
                    </View>
                )
        }
    }

    return (
        <Screen preset="fixed" style={themed($styles.screen)} safeAreaEdges={["bottom"]}>
            <Header leftIcon="chevron-left" onLeftPress={goBack} RightActionComponent={<MentraLogoStandalone />} />
            <View style={themed($container)}>
                <ScrollView
                    style={themed($scrollView)}
                    contentContainerStyle={themed($scrollContent)}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={themed($contentContainer)}>
                        {/* Meta logo/image */}
                        <View style={themed($headerContainer)}>
                            <Text style={themed($brandText)} text="META" />
                            <Text style={themed($modelText)} text={glassesModelName} />
                        </View>

                        {renderContent()}
                    </View>
                </ScrollView>
            </View>
        </Screen>
    )
}

// Tip Item Component
interface TipItemProps {
    icon: string
    title: string
    description: string
}

function TipItem({ icon, title, description }: TipItemProps) {
    const { theme, themed } = useAppTheme()

    return (
        <View style={themed($tipItem)}>
            <Icon name={icon as any} size={24} color={theme.colors.text} style={themed($tipIcon)} />
            <View style={themed($tipTextContainer)}>
                <Text style={themed($tipTitle)} text={title} />
                <Text style={themed($tipDescription)} text={description} />
            </View>
        </View>
    )
}

// Styles
const $container: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    flex: 1,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s6,
})

const $scrollView: ThemedStyle<ViewStyle> = () => ({
    flex: 1,
})

const $scrollContent: ThemedStyle<ViewStyle> = () => ({
    flexGrow: 1,
})

const $contentContainer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
    flexGrow: 1,
    backgroundColor: colors.primary_foreground,
    borderRadius: spacing.s6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.s6,
    gap: spacing.s4,
})

const $headerContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    alignItems: "center",
    marginBottom: spacing.s4,
    paddingTop: spacing.s2,
    paddingHorizontal: spacing.s4,
})

const $brandText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: 8,
    textAlign: "center",
    lineHeight: 42,
})

const $modelText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 16,
    fontWeight: "500",
    color: colors.textDim,
    marginTop: 4,
})

const $tipContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    gap: spacing.s4,
})

const $tipItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.s3,
})

const $tipIcon: ThemedStyle<any> = ({ spacing }) => ({
    marginTop: 2,
})

const $tipTextContainer: ThemedStyle<ViewStyle> = () => ({
    flex: 1,
})

const $tipTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
})

const $tipDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 14,
    color: colors.textDim,
    marginTop: 2,
})

const $infoText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
})

const $connectButton: ThemedStyle<ViewStyle> = () => ({
    width: "100%",
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    width: "100%",
    marginTop: spacing.s2,
})

const $cancelButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    width: "100%",
    marginTop: spacing.s2,
})

const $loadingContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.s4,
})

const $loadingText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
})

const $loadingSubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
})

const $successContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.s4,
})

const $successText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
})

const $successSubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
})

const $errorContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.s4,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 24,
    fontWeight: "700",
    color: colors.error,
    textAlign: "center",
})

const $errorSubtext: ThemedStyle<TextStyle> = ({ colors }) => ({
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
})
