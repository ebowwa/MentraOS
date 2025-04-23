import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Button from '../components/Button';
import coreCommunicator from '../bridge/CoreCommunicator';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';

type GlassesWifiSetupScreenProps = {
  isDarkTheme: boolean;
  toggleTheme: () => void;
};

const GlassesWifiSetupScreen: React.FC<GlassesWifiSetupScreenProps> = ({ isDarkTheme }) => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [networks, setNetworks] = useState<string[]>([]);
  const [showNetworksList, setShowNetworksList] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { deviceModel } = route.params as { deviceModel: string };
  
  useEffect(() => {
    // Listen for WiFi scan results
    const wifiScanResultsListener = GlobalEventEmitter.addListener(
      'WIFI_SCAN_RESULTS',
      (data: { networks: string[] }) => {
        console.log('WiFi scan results received:', data.networks);
        setNetworks(data.networks);
        setShowNetworksList(true);
        setIsScanning(false);
      }
    );
    
    // Cleanup listener on unmount
    return () => {
      wifiScanResultsListener.remove();
    };
  }, []);

  const handleSubmit = async () => {
    if (!ssid) {
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'WiFi network name (SSID) is required', 
        type: 'error' 
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Send WiFi credentials to Core using the updated method
      await coreCommunicator.sendWifiCredentials(ssid, password);
      
      // Show success message
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'WiFi credentials sent to glasses', 
        type: 'success' 
      });
      
      // Navigate back to home screen
      navigation.navigate('Home');
    } catch (error) {
      console.error('Error setting WiFi credentials:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'Failed to send WiFi credentials', 
        type: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    GlobalEventEmitter.emit('SHOW_BANNER', { 
      message: 'WiFi setup skipped. You can set up WiFi later in settings.', 
      type: 'info' 
    });
    navigation.navigate('Home');
  };
  
  const handleScan = async () => {
    try {
      setIsScanning(true);
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'Scanning for WiFi networks...', 
        type: 'info' 
      });
      
      await coreCommunicator.requestWifiScan();
      
      // In a real implementation, we would listen for the scan results
      // and update a list of available networks
      
    } catch (error) {
      console.error('Error scanning for WiFi networks:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'Failed to scan for WiFi networks', 
        type: 'error' 
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Function to handle network selection from the list
  const handleNetworkSelect = (selectedNetwork: string) => {
    setSsid(selectedNetwork);
    setShowNetworksList(false);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDarkTheme ? '#000' : '#fff' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: isDarkTheme ? '#fff' : '#000' }]}>
          WiFi Setup Required
        </Text>
        
        <Text style={[styles.subtitle, { color: isDarkTheme ? '#ccc' : '#333' }]}>
          Your {deviceModel} glasses need WiFi credentials to connect to the internet.
        </Text>
        
        <View style={styles.form}>
          <Text style={[styles.label, { color: isDarkTheme ? '#fff' : '#000' }]}>WiFi Network Name (SSID)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, { 
                color: isDarkTheme ? '#fff' : '#000',
                backgroundColor: isDarkTheme ? '#333' : '#f5f5f5',
                borderColor: isDarkTheme ? '#444' : '#ddd'
              }]}
              value={ssid}
              onChangeText={setSsid}
              placeholder="Enter WiFi network name"
              placeholderTextColor={isDarkTheme ? '#aaa' : '#999'}
              autoCapitalize="none"
            />
            <Button
              title={isScanning ? "Scanning..." : "Scan"}
              onPress={handleScan}
              type="secondary"
              style={styles.scanButton}
              disabled={isScanning}
            />
          </View>
          
          {/* Networks List */}
          {showNetworksList && networks.length > 0 && (
            <View style={[styles.networksContainer, { 
              backgroundColor: isDarkTheme ? '#222' : '#f0f0f0',
              borderColor: isDarkTheme ? '#444' : '#ddd'
            }]}>
              <Text style={[styles.networksTitle, { color: isDarkTheme ? '#fff' : '#000' }]}>
                Available Networks
              </Text>
              <FlatList
                data={networks}
                keyExtractor={(item, index) => `network-${index}`}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.networkItem, {
                      backgroundColor: isDarkTheme ? '#333' : '#fff'
                    }]}
                    onPress={() => handleNetworkSelect(item)}
                  >
                    <Text style={{ color: isDarkTheme ? '#fff' : '#000' }}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
                style={styles.networksList}
              />
            </View>
          )}
          
          <Text style={[styles.label, { color: isDarkTheme ? '#fff' : '#000' }]}>Password</Text>
          <TextInput
            style={[styles.input, { 
              color: isDarkTheme ? '#fff' : '#000',
              backgroundColor: isDarkTheme ? '#333' : '#f5f5f5',
              borderColor: isDarkTheme ? '#444' : '#ddd'
            }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter WiFi password"
            placeholderTextColor={isDarkTheme ? '#aaa' : '#999'}
            secureTextEntry
            autoCapitalize="none"
          />
          
          <View style={styles.buttonContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color={isDarkTheme ? '#fff' : '#000'} />
            ) : (
              <>
                <Button
                  title="Connect"
                  onPress={handleSubmit}
                  disabled={!ssid}
                />
                
                <Button
                  title="Skip for Now"
                  onPress={handleSkip}
                  type="secondary"
                  style={{ marginTop: 10 }}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  input: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
  },
  scanButton: {
    marginLeft: 10,
    height: 50,
    justifyContent: 'center',
  },
  buttonContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  networksContainer: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    maxHeight: 200,
  },
  networksTitle: {
    fontSize: 16,
    fontWeight: '500',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  networksList: {
    maxHeight: 150,
  },
  networkItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
});

export default GlassesWifiSetupScreen;