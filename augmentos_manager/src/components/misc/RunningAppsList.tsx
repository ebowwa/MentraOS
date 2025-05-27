import React, {useMemo, useState, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useAppStatus } from '@/contexts/AppStatusProvider';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import coreCommunicator from '@/bridge/CoreCommunicator';
import AppIcon from './AppIcon';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';
import BackendServerComms from '@/backend_comms/BackendServerComms';
import ChevronRight from 'assets/icons/ChevronRight';
import EmptyApps from '../home/EmptyApps';
import ListHeaderActiveApps from "@/components/home/ListHeaderActiveApps"

interface RunningAppsListProps {
  isDarkTheme: boolean;
}

const RunningAppsList: React.FC<RunningAppsListProps> = ({isDarkTheme}) => {
  const { appStatus, refreshAppStatus, optimisticallyStopApp, clearPendingOperation } = useAppStatus();
  const backendComms = BackendServerComms.getInstance();
  const [_isLoading, setIsLoading] = useState(false);
  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const navigation = useNavigation<NavigationProps>();
  const scrollViewRef = useRef<ScrollView>(null);

  const stopApp = async (packageName: string) => {
    console.log('STOP APP');

    // Optimistically update UI first
    optimisticallyStopApp(packageName);

    setIsLoading(true);
    try {
      await backendComms.stopApp(packageName);
      // Clear the pending operation since it completed successfully
      clearPendingOperation(packageName);
    } catch (error) {
      // On error, refresh from the server to get the accurate state
      refreshAppStatus();
      console.error('Stop app error:', error);
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

  const runningApps = useMemo(
    () => appStatus.filter(app => app.is_running),
    [appStatus],
  );

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  function getNewRow() {
    return (
      <View style={styles.appsContainer}>
        <View style={styles.listContainer}>

          {runningApps.length > 0 ? (
            <>
              <ListHeaderActiveApps />
              {runningApps.map((app, index) => (
                <View style={[styles.everything, styles.everythingFlexBox]}>
                  <View style={[styles.appDescription, styles.everythingFlexBox]}>
                    <AppIcon
                      app={app}
                      isDarkTheme={isDarkTheme}
                      isForegroundApp={app.is_foreground}
                      style={styles.appIcon}
                    />
                    <View style={styles.appNameWrapper}>
                      <Text style={styles.appName} numberOfLines={1}>{app.name}</Text>
                    </View>
                  </View>
                  <View style={[styles.toggleParent, styles.everythingFlexBox]}>
                    <TouchableOpacity
                      key={index}
                      onPress={() => stopApp(app.packageName)}
                      onLongPress={() => openAppSettings(app)}
                      delayLongPress={500}
                      style={{ padding: 10, borderRadius: 20 }}
                    >
                      <View style={styles.toggle}>
                        <View style={[styles.toggleBarIcon, styles.toggleIconLayout, { backgroundColor: "#565E8C" }]} />
                        <View
                          style={[
                            styles.toggleCircleIcon,
                            styles.toggleIconLayout,
                            { left: "44.44%" }
                          ]}
                        >
                          <View style={{ flex: 1, borderRadius: 12, backgroundColor: "#CED2ED" }} />
                        </View>
                      </View>
                    </TouchableOpacity>
                    <ChevronRight />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <EmptyApps />

          )}
        </View>
      </View>
    );
  }

  return getNewRow();
};

const styles = StyleSheet.create({
  appsContainer: {
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Montserrat-Bold',
    lineHeight: 22,
    letterSpacing: 0.38,
  },
  listContainer: {
    gap: 10,
  },
  appItemWrapper: {
    marginBottom: 0.5,
    borderRadius: 12,
  },
  appItem: {
    borderRadius: 12,
    padding: 11,
    overflow: 'hidden',
  },
  appContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  settingsButton: {
    padding: 50,
    margin: -46,
  },
  noAppsContainer: {
    // marginBottom: 8, // Removing this to maintain consistent spacing
  },
  noAppsGradient: {
    borderRadius: 12,
    padding: 11, // Match padding with regular app items
    minHeight: 40,
  },
  noAppsContent: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50, // Added 2 more pixels for perfect height match
  },
  noAppsTitle: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  noAppsText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  appIcon: {
    width: 32,
    height: 32,
  },
  toggle: {
    width: 36,
    height: 20
  },
  toggleBarIcon: {
    height: "80%",
    width: "94.44%",
    top: "15%",
    right: "5.56%",
    bottom: "15%",
    left: "0%",
    borderRadius: 8,
    maxHeight: "100%"
  },
  toggleCircleIcon: {
    width: "55.56%",
    top: 0,
    right: "47.22%",
    left: "-2.78%",
    borderRadius: 12,
    height: 20
  },
  toggleIconLayout: {
    maxWidth: "100%",
    position: "absolute",
    overflow: "hidden"
  },
  everythingFlexBox: {
    flexDirection: "row",
    alignItems: "center"
  },
  everything: {
    justifyContent: "space-between",
    gap: 0,
    alignSelf: "stretch"
  },
  toggleParent: {
    gap: 12
  },
  appDescription: {
    gap: 17,
    justifyContent: "center"
  },
  appNameWrapper: {
    justifyContent: "center"
  },
  appName: {
    fontSize: 15,
    letterSpacing: 0.6,
    lineHeight: 20,
    fontFamily: "SF Pro Rounded",
    color: "#ced2ed",
    textAlign: "left",
    overflow: "hidden"
  },
});

export default RunningAppsList;
