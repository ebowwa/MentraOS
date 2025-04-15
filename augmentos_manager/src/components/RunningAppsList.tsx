import React, {useMemo, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useStatus} from '../providers/AugmentOSStatusProvider';
import AppIcon from './AppIcon';
import coreCommunicator from '../bridge/CoreCommunicator';

interface RunningAppsListProps {
  isDarkTheme: boolean;
}

const RunningAppsList: React.FC<RunningAppsListProps> = ({isDarkTheme}) => {
  const {status, updateAppStatus, startAppOperation, endAppOperation, isAppOperationPending} = useStatus();
  const [_isLoading, setIsLoading] = useState(false);
  const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
  const gradientColors = isDarkTheme
    ? ['#4a3cb5', '#7856FE', '#9a7dff']
    : ['#56CCFE', '#FF8DF6', '#FFD04E'];

  const stopApp = async (packageName: string) => {
    console.log('STOP APP');
    
    // Check if there's a pending operation for this app
    if (isAppOperationPending(packageName)) {
      console.log(`Cannot stop app ${packageName}: operation already in progress`);
      return;
    }
    
    // Register the stop operation
    if (!startAppOperation(packageName, 'stop')) {
      console.log(`Cannot stop app ${packageName}: operation rejected`);
      return;
    }
    
    setIsLoading(true);
    try {
      // Immediately update the app status locally
      updateAppStatus(packageName, false, false);
      
      // Then request the server to stop the app
      await coreCommunicator.stopAppByPackageName(packageName);
    } catch (error) {
      // Revert the status change if there was an error
      updateAppStatus(packageName, true, true);
      console.error('Stop app error:', error);
    } finally {
      setIsLoading(false);
      // End the operation regardless of success or failure
      endAppOperation(packageName);
    }
  };

  const runningApps = useMemo(
    () => status.apps.filter(app => app.is_running),
    [status],
  );

  return (
    <View style={styles.appsContainer}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>
        Running Apps
      </Text>
      <LinearGradient
        colors={gradientColors}
        style={styles.gradientBackground}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 1}}>
        {runningApps.length > 0 ? (
          <View style={styles.appIconsContainer}>
            {runningApps.map((app, index) => (
              <View key={index} style={styles.iconWrapper}>
                <AppIcon
                  app={app}
                  onClick={() => stopApp(app.packageName)}
                  isForegroundApp={app.is_foreground}
                  isDarkTheme={isDarkTheme}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.noAppsContainer}>
            <Text style={[styles.noAppsText, {color: textColor}]}>
              No apps, start apps below.
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  appsContainer: {
    justifyContent: 'flex-start',
    marginTop: 10,
    marginBottom: 10,
    height: 160,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Montserrat-Bold',
    lineHeight: 22,
    letterSpacing: 0.38,
    marginBottom: 10,
  },
  gradientBackground: {
    height: 120,
    paddingHorizontal: 15,
    borderRadius: 20,
    paddingVertical: 15,
  },
  appIconsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    width: '100%',
    flexWrap: 'wrap',
  },
  iconWrapper: {
    alignItems: 'center',
  },
  noAppsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noAppsText: {
    textAlign: 'center',
  },
});

export default RunningAppsList;
