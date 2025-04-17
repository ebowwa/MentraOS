import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ToastAndroid,
  ActivityIndicator,
  SafeAreaView,
  Linking,
  Share,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { showAlert } from '../utils/AlertUtils';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from '../components/types';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { shareFile } from '../utils/FileUtils';
import VideoThumbnail from '../components/VideoThumbnail';

interface GlassesRecordingsGalleryProps {
  isDarkTheme: boolean;
}

const GlassesRecordingsGallery: React.FC<GlassesRecordingsGalleryProps> = ({
  isDarkTheme,
}) => {
  const [recordedVideos, setRecordedVideos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const navigation = useNavigation<NavigationProps>();

  useEffect(() => {
    loadRecordings();
    
    // Ensure status bar is visible
    StatusBar.setHidden(false);
    // Set appropriate styling for the status bar based on theme
    StatusBar.setBarStyle(isDarkTheme ? 'light-content' : 'dark-content');
    
    return () => {
      // No cleanup needed for status bar, let the next screen handle it
    };
  }, [isDarkTheme]);
  
  // Pull to refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecordings().then(() => setRefreshing(false));
  }, []);

  // Load recorded videos
  const loadRecordings = async () => {
    try {
      setIsLoading(true);
      // Define the videos directory
      const videoDir = Platform.OS === 'ios' 
        ? `${RNFS.DocumentDirectoryPath}/AugmentOSRecordings` 
        : `${RNFS.ExternalDirectoryPath}/AugmentOSRecordings`;
      
      // Check if directory exists, create if not
      const dirExists = await RNFS.exists(videoDir);
      if (!dirExists) {
        await RNFS.mkdir(videoDir);
        setRecordedVideos([]);
        setIsLoading(false);
        return;
      }
      
      // Read directory contents
      const files = await RNFS.readDir(videoDir);
      
      // Filter for video files
      const videoFiles = files
        .filter(file => file.name.endsWith('.mp4'))
        .map(file => file.path)
        .sort((a, b) => {
          // Sort by creation time (latest first)
          return b.localeCompare(a);
        });
      
      setRecordedVideos(videoFiles);
    } catch (error) {
      console.error('Error loading recordings:', error);
      Alert.alert('Error', 'Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
    // Return a resolved promise for chaining with refresh
    return Promise.resolve();
  };

  // Share a video file
  const shareVideo = async (filePath: string) => {
    try {
      console.log('GlassesRecordingsGallery: Starting video share for:', filePath);
      
      // Use our utility function that handles both platforms properly
      await shareFile(
        filePath,
        'video/mp4',
        'Share AugmentOS Recording',
        'Check out this recording from my smart glasses!'
      );
      
      console.log('GlassesRecordingsGallery: Share completed successfully');
    } catch (error) {
      console.error('GlassesRecordingsGallery: Error sharing video:', error);
      
      // Check if it's a file provider error (likely on first run after adding the module)
      if (
        error instanceof Error && 
        (error.message?.includes('FileProvider') || error.message?.includes('content://'))
      ) {
        // Special error for FileProvider issues
        showAlert(
          'Sharing Not Available', 
          'File sharing requires app restart after update. Please close and reopen the app, then try again.',
          undefined,
          { iconName: 'refresh', iconColor: '#FF9500' }
        );
      } else {
        // Generic error
        showAlert(
          'Sharing Error', 
          'Failed to share the video. Please try again.',
          undefined,
          { iconName: 'error', iconColor: '#FF3B30' }
        );
      }
    }
  };
  
  // Play video in our custom video player
  const playVideo = (filePath: string) => {
    try {
      // Extract filename from path for display
      const fileName = filePath.split('/').pop() || '';
      
      // Navigate to our custom video player screen
      navigation.navigate('VideoPlayerScreen', {
        filePath: filePath,
        fileName: fileName,
      });
    } catch (error) {
      console.error('Error playing video:', error);
      showAlert('Playback Error', 
        'Unable to play the video. Please try again.',
        undefined,
        { iconName: 'error', iconColor: '#FF3B30' }
      );
    }
  };
  
  // Delete a recorded video
  const deleteVideo = async (filePath: string) => {
    try {
      // Confirm before deleting
      showAlert(
        'Delete Recording',
        'Are you sure you want to delete this recording?',
        [
          { 
            text: 'Cancel', 
            style: 'cancel' 
          },
          { 
            text: 'Delete', 
            style: 'destructive',
            onPress: async () => {
              try {
                await RNFS.unlink(filePath);
                await loadRecordings();
                if (Platform.OS === 'android') {
                  ToastAndroid.show('Recording deleted', ToastAndroid.SHORT);
                } else {
                  showAlert('Success', 'Recording deleted successfully', undefined, {
                    iconName: 'check-circle',
                    iconColor: '#4CAF50'
                  });
                }
              } catch (error) {
                console.error('Error deleting video:', error);
                showAlert('Error', 'Failed to delete the recording', undefined, {
                  iconName: 'error',
                  iconColor: '#FF3B30'
                });
              }
            } 
          },
        ],
        {
          iconName: 'delete',
          iconColor: '#FF3B30'
        }
      );
    } catch (error) {
      console.error('Error deleting video:', error);
      showAlert('Delete Error', 'Failed to delete the video', undefined, {
        iconName: 'error',
        iconColor: '#FF3B30'
      });
    }
  };

  return (
    <SafeAreaView style={[
      styles.container,
      isDarkTheme ? styles.darkBackground : styles.lightBackground
    ]}>
      {/* Explicitly show status bar with appropriate styling */}
      <StatusBar 
        hidden={false}
        barStyle={isDarkTheme ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkTheme ? '#121212' : '#f0f0f0'}
        translucent={false}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4c8bf5" />
          <Text style={[
            styles.loadingText,
            isDarkTheme ? styles.lightText : styles.darkText
          ]}>
            Loading recordings...
          </Text>
        </View>
      ) : recordedVideos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[
            styles.emptyText,
            isDarkTheme ? styles.lightText : styles.darkText
          ]}>
            No recordings found
          </Text>
          <Text style={[
            styles.emptySubtext,
            isDarkTheme ? styles.lightText : styles.darkText
          ]}>
            Create a recording from the glasses mirror screen
          </Text>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={() => navigation.navigate('GlassesMirrorFullscreen')}
          >
            <Text style={styles.recordButtonText}>
              Go to Camera
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView 
          style={styles.recordingsList}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              colors={['#4c8bf5']}
              tintColor={isDarkTheme ? '#ffffff' : '#000000'}
            />
          }>
          {recordedVideos.map((videoPath, index) => {
            // Extract filename from path
            const filename = videoPath.split('/').pop() || '';
            // Convert timestamp in filename to readable date
            let dateString = "Unknown date";
            let timestamp = 0;
            const match = filename.match(/glasses-recording-(\d+)\.mp4/);
            if (match && match[1]) {
              timestamp = parseInt(match[1]);
              dateString = new Date(timestamp).toLocaleString();
            }
            
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.videoItem,
                  isDarkTheme ? styles.videoItemDark : styles.videoItemLight
                ]}
                onPress={() => playVideo(videoPath)}
                activeOpacity={0.7}
              >
                <View style={styles.videoItemContent}>
                  {/* Left: Video Thumbnail */}
                  <View style={styles.thumbnailContainer}>
                    <VideoThumbnail
                      videoPath={videoPath}
                      isDarkTheme={isDarkTheme}
                    />
                  </View>
                  
                  {/* Right: Info and Actions */}
                  <View style={styles.videoInfoContainer}>
                    {/* Date and Time */}
                    <Text style={[
                      styles.videoDate,
                      isDarkTheme ? styles.lightText : styles.darkText
                    ]}>
                      {timestamp ? new Date(timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }) : "Unknown date"}
                    </Text>
                    
                    <Text style={[
                      styles.videoTime,
                      isDarkTheme ? styles.lightText : styles.darkText
                    ]}>
                      {timestamp ? new Date(timestamp).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : ""}
                    </Text>
                    
                    {/* Action Buttons */}
                    <View style={styles.videoActions}>
                      <TouchableOpacity 
                        style={[styles.videoActionButton, styles.shareButton]}
                        onPress={(e) => {
                          e.stopPropagation(); // Prevent triggering the card's onPress
                          shareVideo(videoPath);
                        }}
                      >
                        <Icon name="share" size={16} color="white" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.videoActionButton, styles.deleteButton]}
                        onPress={(e) => {
                          e.stopPropagation(); // Prevent triggering the card's onPress
                          deleteVideo(videoPath);
                        }}
                      >
                        <Icon name="delete" size={16} color="white" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0, // No extra padding at top since we're using the React Navigation header
  },
  darkBackground: {
    backgroundColor: '#121212',
  },
  lightBackground: {
    backgroundColor: '#f0f0f0',
  },
  darkText: {
    color: '#000000',
  },
  lightText: {
    color: '#ffffff',
  },
  // Header styles removed as we're using native header
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 20,
    fontFamily: 'Montserrat-Bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.7,
  },
  recordButton: {
    backgroundColor: '#4c8bf5',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
  },
  recordButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Montserrat-Bold',
  },
  recordingsList: {
    flex: 1,
    padding: 15,
    paddingTop: 10, // Reduced top padding since we have the native header now
  },
  videoItem: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  videoItemDark: {
    backgroundColor: '#2a2a2a',
  },
  videoItemLight: {
    backgroundColor: '#ffffff',
  },
  videoItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnailContainer: {
    padding: 8,
  },
  videoInfoContainer: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  videoDate: {
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  videoTime: {
    fontSize: 13,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 10,
    opacity: 0.7,
  },
  videoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10, // Gap between buttons
  },
  videoActionButton: {
    width: 36, // Smaller buttons
    height: 36, // Smaller buttons
    borderRadius: 18, // Circular buttons
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  // playButton removed as requested
  shareButton: {
    backgroundColor: '#2196F3', // Blue
  },
  deleteButton: {
    backgroundColor: '#FF5252', // Red
  },
  videoActionText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Montserrat-Bold',
    fontWeight: 'bold',
  },
});

export default GlassesRecordingsGallery;