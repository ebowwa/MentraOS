import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { useAsgCamera } from './useAsgCamera'
import { translate } from '@/i18n/translate'

interface AsgCameraExampleProps {
  serverUrl?: string
  port?: number
}

export default function AsgCameraExample({ serverUrl, port = 8089 }: AsgCameraExampleProps) {
  const [manualServerUrl, setManualServerUrl] = useState(serverUrl || '')
  
  const {
    // Server connection
    isConnected,
    isConnecting,
    serverInfo,
    connectError,
    
    // Gallery
    photos,
    isLoadingGallery,
    galleryError,
    
    // Latest photo
    latestPhotoUrl,
    isLoadingLatestPhoto,
    latestPhotoError,
    
    // Actions
    connect,
    disconnect,
    refreshGallery,
    takePicture,
    getLatestPhoto,
    downloadPhoto,
    
    // Utility
    setServer,
  } = useAsgCamera({
    serverUrl: manualServerUrl,
    port,
    autoConnect: !!manualServerUrl,
  })

  const handleTakePicture = async () => {
    try {
      await takePicture()
      Alert.alert('Success', 'Picture taken successfully!')
    } catch (error) {
      Alert.alert('Error', 'Failed to take picture')
    }
  }

  const handleDownloadPhoto = async (filename: string) => {
    try {
      await downloadPhoto(filename)
      Alert.alert('Success', 'Photo download started!')
    } catch (error) {
      Alert.alert('Error', 'Failed to download photo')
    }
  }

  const handleConnect = async () => {
    if (!manualServerUrl) {
      Alert.alert('Error', 'Please enter a server URL')
      return
    }
    
    setServer(manualServerUrl, port)
    await connect()
  }

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        ASG Camera Server
      </Text>

      {/* Server Connection */}
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
          Server Connection
        </Text>
        
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Text style={{ flex: 1, marginRight: 8 }}>
            Server URL:
          </Text>
          <Text style={{ flex: 2 }}>
            {manualServerUrl || 'Not set'}
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', marginBottom: 8 }}>
          <Text style={{ flex: 1, marginRight: 8 }}>
            Status:
          </Text>
          <Text style={{ 
            flex: 2, 
            color: isConnected ? 'green' : isConnecting ? 'orange' : 'red',
            fontWeight: '500'
          }}>
            {isConnecting ? 'Connecting...' : isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
        
        {connectError && (
          <Text style={{ color: 'red', marginBottom: 8 }}>
            Error: {connectError}
          </Text>
        )}
        
        {serverInfo && (
          <View style={{ marginBottom: 8 }}>
            <Text>Port: {serverInfo.port}</Text>
            <Text>Uptime: {Math.round(serverInfo.uptime / 1000)}s</Text>
            <Text>Total Photos: {serverInfo.total_photos}</Text>
          </View>
        )}
        
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={{
              backgroundColor: isConnected ? '#ccc' : '#007AFF',
              padding: 12,
              borderRadius: 8,
              flex: 1,
            }}
            onPress={handleConnect}
            disabled={isConnected || isConnecting}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={{
              backgroundColor: isConnected ? '#FF3B30' : '#ccc',
              padding: 12,
              borderRadius: 8,
              flex: 1,
            }}
            onPress={disconnect}
            disabled={!isConnected}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>
              Disconnect
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera Controls */}
      {isConnected && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Camera Controls
          </Text>
          
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#34C759',
                padding: 12,
                borderRadius: 8,
                flex: 1,
              }}
              onPress={handleTakePicture}
            >
              <Text style={{ color: 'white', textAlign: 'center' }}>
                Take Picture
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={{
                backgroundColor: '#007AFF',
                padding: 12,
                borderRadius: 8,
                flex: 1,
              }}
              onPress={getLatestPhoto}
            >
              <Text style={{ color: 'white', textAlign: 'center' }}>
                Get Latest
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Latest Photo */}
      {isConnected && (
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Latest Photo
          </Text>
          
          {isLoadingLatestPhoto ? (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <ActivityIndicator size="large" />
              <Text>Loading latest photo...</Text>
            </View>
          ) : latestPhotoError ? (
            <Text style={{ color: 'red' }}>Error: {latestPhotoError}</Text>
          ) : latestPhotoUrl ? (
            <Image
              source={{ uri: latestPhotoUrl }}
              style={{ width: '100%', height: 200, borderRadius: 8 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ color: '#666' }}>No photo taken yet</Text>
          )}
        </View>
      )}

      {/* Gallery */}
      {isConnected && (
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>
              Photo Gallery ({photos.length})
            </Text>
            <TouchableOpacity
              style={{
                backgroundColor: '#007AFF',
                padding: 8,
                borderRadius: 6,
              }}
              onPress={refreshGallery}
              disabled={isLoadingGallery}
            >
              <Text style={{ color: 'white', fontSize: 12 }}>
                {isLoadingGallery ? 'Loading...' : 'Refresh'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {galleryError && (
            <Text style={{ color: 'red', marginBottom: 8 }}>
              Error: {galleryError}
            </Text>
          )}
          
          {isLoadingGallery ? (
            <View style={{ alignItems: 'center', padding: 20 }}>
              <ActivityIndicator size="large" />
              <Text>Loading gallery...</Text>
            </View>
          ) : photos.length === 0 ? (
            <Text style={{ color: '#666' }}>No photos in gallery</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((photo, index) => (
                <View key={index} style={{ marginRight: 12, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => handleDownloadPhoto(photo.name)}
                    style={{
                      width: 80,
                      height: 80,
                      backgroundColor: '#f0f0f0',
                      borderRadius: 8,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 12, textAlign: 'center' }}>
                      {photo.name}
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: 10, marginTop: 4, textAlign: 'center' }}>
                    {Math.round(photo.size / 1024)}KB
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </ScrollView>
  )
} 