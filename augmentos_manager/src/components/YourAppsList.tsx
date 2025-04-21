// YourAppsList.tsx
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Animated,
} from 'react-native';
import showAlert from '../utils/AlertUtils';
import MessageModal from './MessageModal';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AppIcon from './AppIcon';
import { NavigationProps } from './types';

interface YourAppsListProps {
    isDarkTheme: boolean;
}

const YourAppsList: React.FC<YourAppsListProps> = ({ isDarkTheme }) => {
    const { status, updateAppStatus } = useStatus();
    const navigation = useNavigation<NavigationProps>();
    const [_isLoading, setIsLoading] = React.useState(false);
    const [onboardingModalVisible, setOnboardingModalVisible] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState(true);
    const [inLiveCaptionsPhase, setInLiveCaptionsPhase] = useState(false);
    const [showSettingsHint, setShowSettingsHint] = useState(false);
    const [showOnboardingTip, setShowOnboardingTip] = useState(false);

    const [containerWidth, setContainerWidth] = React.useState(0);
    const arrowAnimation = React.useRef(new Animated.Value(0)).current;

    // Constants for grid item sizing
    const GRID_MARGIN = 6; // Total horizontal margin per item (left + right)
    const numColumns = 4; // Desired number of columns

    // Calculate the item width based on container width and margins
    const itemWidth = containerWidth > 0 ? (containerWidth - (GRID_MARGIN * numColumns)) / numColumns : 0;
    
    const textColor = isDarkTheme ? '#FFFFFF' : '#000000';

    // Check onboarding status whenever the screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            const checkOnboardingStatus = async () => {
                const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
                setOnboardingCompleted(completed);

                if (!completed) {
                    setOnboardingModalVisible(true);
                    setShowSettingsHint(false); // Hide settings hint during onboarding
                    setShowOnboardingTip(true);
                } else {
                    setShowOnboardingTip(false);

                    // If onboarding is completed, check how many times settings have been accessed
                    const settingsAccessCount = await loadSetting(SETTINGS_KEYS.SETTINGS_ACCESS_COUNT, 0);
                    // Only show hint if they've accessed settings less than 1 times
                    setShowSettingsHint(settingsAccessCount < 1);
                }
            };

            checkOnboardingStatus();
        }, [])
    );

    // Set arrow to static position (no animation)
    useEffect(() => {
        // Just set to a fixed value instead of animating
        if (showOnboardingTip) {
            arrowAnimation.setValue(0.5); // Middle value for static appearance
        } else {
            arrowAnimation.setValue(0);
        }
    }, [showOnboardingTip]);

    // Check if onboarding is completed on initial load
    useEffect(() => {
        const checkOnboardingStatus = async () => {
            const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
            setOnboardingCompleted(completed);
            setShowOnboardingTip(!completed);
        };

        checkOnboardingStatus();
    }, []);

    const completeOnboarding = () => {
        saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
        setOnboardingCompleted(true);
        setShowOnboardingTip(false);
        setInLiveCaptionsPhase(false); // Reset any live captions phase state

        // Make sure to post an update to ensure all components re-render
        // This is important to immediately hide any UI elements that depend on these states
        setTimeout(() => {
            // Force a re-render by setting state again
            setShowOnboardingTip(false);
            setShowSettingsHint(true);
        }, 100);
    };

    const startApp = async (packageName: string) => {
        if (!onboardingCompleted) {
            if (packageName !== 'com.augmentos.livecaptions' && packageName !== "cloud.augmentos.live-captions") {
                showAlert(
                    "Complete Onboarding",
                    "Please tap the Live Captions app to complete the onboarding process.",
                    [{ text: "OK" }],
                    {
                        isDarkTheme,
                        iconName: "information-outline"
                    }
                );
                return;
            } else {
                completeOnboarding();
            }
        }
        
        // Update UI immediately
        updateAppStatus(packageName, true, true);
        
        // Start the operation in the background
        setIsLoading(true);
        try {
            await BackendServerComms.getInstance().startApp(packageName);
            
            if (!onboardingCompleted && packageName === 'com.augmentos.livecaptions') {
                // If this is the Live Captions app, make sure we've hidden the tip
                setShowOnboardingTip(false);
                
                setTimeout(() => {
                    showAlert(
                        "Try Live Captions!",
                        "Start talking now to see your speech transcribed on your glasses in real-time!",
                        [{ text: "OK" }],
                        {
                            isDarkTheme,
                            iconName: "microphone"
                        }
                    );
                }, 500);
            }
        } catch (error) {
            // Only revert the status if the operation failed
            updateAppStatus(packageName, false, false);
            console.error('start app error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const openAppSettings = (app: any) => {
        navigation.navigate('AppSettings', {
            packageName: app.packageName,
            appName: app.name
        });
    };

    const [isSensingEnabled, setIsSensingEnabled] = React.useState(
        status.core_info.sensing_enabled,
    );
    useEffect(() => {
        setIsSensingEnabled(status.core_info.sensing_enabled);
    }, [status.core_info.sensing_enabled]);

    // Filter out duplicate apps and running apps
    const availableApps = status.apps.filter(app => {
        if (app.is_running) {
            return false;
        }
        // Check if this is the first occurrence of this package name
        const firstIndex = status.apps.findIndex(a => a.packageName === app.packageName);
        return firstIndex === status.apps.indexOf(app);
    });

    return (
        <View style={styles.appsContainer}>
            <View style={styles.titleContainer}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                    Inactive Apps ({availableApps.length})
                </Text>
            </View>

            {/* Sensing Disabled Warning */}
            {!isSensingEnabled && (
                <View style={[
                    styles.sensingWarningContainer, 
                    { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }
                ]}>
                    <View style={styles.warningContent}>
                        <Icon name="microphone-off" size={22} color="#FF9800" />
                        <Text style={styles.warningText}>
                            Sensing is disabled. Microphone and sensors won't work in apps.
                        </Text>
                    </View>
                    <TouchableOpacity 
                        style={styles.settingsButton}
                        onPress={() => {
                            // Navigate to the Settings page
                            navigation.navigate('PrivacySettingsScreen');
                        }}
                    >
                        <Text style={styles.settingsButtonText}>Settings</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Settings hint - only shown after onboarding and if settings accessed count < 3 */}
            {showSettingsHint && (
                <View
                    style={[
                        styles.settingsHintContainer,
                        {
                            backgroundColor: isDarkTheme ? '#1A2733' : '#E3F2FD',
                            borderColor: isDarkTheme ? '#1E88E5' : '#BBDEFB'
                        }
                    ]}
                >
                    <View style={styles.hintContent}>
                        <Icon name="gesture-tap-hold" size={22} color="#2196F3" />
                        <Text style={[
                            styles.hintText,
                            { color: isDarkTheme ? '#FFFFFF' : '#0D47A1' }
                        ]}>
                            Long-press any app to access its settings
                        </Text>
                    </View>
                </View>
            )}
            
            <ScrollView 
                style={styles.listContainer}
                showsVerticalScrollIndicator={false}
            >
                {availableApps.map((app, index) => (
                    <TouchableOpacity
                        key={app.packageName}
                        onPress={() => startApp(app.packageName)}
                        onLongPress={() => openAppSettings(app)}
                        delayLongPress={500}
                        style={styles.appItem}
                    >
                        {showOnboardingTip && app.packageName === 'com.augmentos.livecaptions' && (
                            <View style={styles.arrowContainer}>
                                <View style={styles.arrowWrapper}>
                                    <View style={styles.arrowBubble}>
                                        <Text style={styles.arrowBubbleText}>
                                            Tap to start
                                        </Text>
                                        <Icon
                                            name="gesture-tap"
                                            size={20}
                                            color="#FFFFFF"
                                            style={styles.bubbleIcon}
                                        />
                                    </View>
                                    <View style={[
                                        styles.arrowIconContainer,
                                        isDarkTheme ? styles.arrowIconContainerDark : styles.arrowIconContainerLight
                                    ]}>
                                        <View style={styles.glowEffect} />
                                        <Icon
                                            name="arrow-down-bold"
                                            size={30}
                                            color="#FFFFFF"
                                            style={{
                                                textShadowColor: 'rgba(0, 0, 0, 0.3)',
                                                textShadowOffset: { width: 0, height: 1 },
                                                textShadowRadius: 3,
                                            }}
                                        />
                                    </View>
                                </View>
                            </View>
                        )}
                        <View style={styles.appContent}>
                            <AppIcon
                                app={app}
                                isDarkTheme={isDarkTheme}
                                onClick={() => startApp(app.packageName)}
                                style={styles.appIconStyle}
                            />
                            <View style={styles.appTextContainer}>
                                <Text style={[styles.appName, {color: textColor}]}>
                                    {app.name || 'Convoscope'}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                onPress={() => openAppSettings(app)}
                                style={styles.settingsButton}
                            >
                                <Icon name="cog-outline" size={24} color={textColor} />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <MessageModal
                visible={onboardingModalVisible && availableApps.length > 0}
                title="Start Live Captions"
                message="To continue, start the Live Captions app."
                buttons={[
                    { text: "Okay", onPress: () => setOnboardingModalVisible(false) }
                ]}
                isDarkTheme={isDarkTheme}
                iconName="gesture-tap"
                iconSize={40}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    appsContainer: {
        marginTop: -8,
        marginBottom: 0,
        width: '100%',
        paddingHorizontal: 0,
        paddingVertical: 10,
    },
    titleContainer: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginLeft: 0,
        paddingLeft: 0,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Montserrat-Bold',
        lineHeight: 22,
        letterSpacing: 0.38,
        marginBottom: 10,
    },
    adjustableText: {
        minHeight: 0,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    listContainer: {
        gap: 4,
    },
    appItem: {
        backgroundColor: '#E8E8E8',
        borderRadius: 12,
        padding: 10,
        marginBottom: 9,
    },
    appContent: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
    },
    itemContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 15,
    },
    tipText: {
        marginLeft: 5,
        fontSize: 14,
    },
    appTextContainer: {
        flex: 1,
        marginLeft: 8,
        justifyContent: 'center',
    },
    appName: {
        fontSize: 16,
        fontWeight: '500',
        flex: 1,
        textAlignVertical: 'center',
    },
    settingsButton: {
        padding: 4,
    },
    appIconStyle: {
        width: 48,
        height: 48,
    },
    arrowContainer: {
        position: 'absolute',
        top: -90,
        zIndex: 10,
        alignItems: 'center',
    },
    arrowWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowBubble: {
        backgroundColor: '#2196F3',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#1E88E5',
    },
    arrowBubbleText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 15,
        marginRight: 6,
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    bubbleIcon: {
        marginLeft: 2,
    },
    arrowIconContainer: {
        width: 45,
        height: 45,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 12,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 2,
        borderColor: '#1E88E5',
    },
    arrowIconContainerLight: {
        backgroundColor: '#2196F3', // Match the bubble color
    },
    arrowIconContainerDark: {
        backgroundColor: '#2196F3', // Add this style for dark theme
    },
    glowEffect: {
        // Missing in the original code, but referenced
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 23,
        backgroundColor: 'rgba(33, 150, 243, 0.3)',
    },
    settingsHintContainer: {
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 12,
    },
    hintContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    hintText: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: '500',
    },
    sensingWarningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 12,
    },
    warningContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    warningText: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: '500',
        color: '#E65100',
        flex: 1,
    },
    settingsButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: 'bold',
    },
});

export default YourAppsList;