import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import NavigationBar from '../components/NavigationBar';
import { supabase } from '../supabaseClient';
import Icon from 'react-native-vector-icons/FontAwesome';

interface ProfileSettingsPageProps {
  isDarkTheme: boolean;
  navigation: any;
}

const ProfileSettingsPage: React.FC<ProfileSettingsPageProps> = ({ isDarkTheme, navigation }) => {
  const [userData, setUserData] = useState<{
    fullName: string | null;
    avatarUrl: string | null;
    email: string | null;
    createdAt: string | null;
    provider: string | null;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error(error);
          setUserData(null);
        } else if (user) {
          const fullName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            null;
          const avatarUrl =
            user.user_metadata?.avatar_url ||
            user.user_metadata?.picture ||
            null;
          const email = user.email || null;
          const createdAt = user.created_at || null;
          const provider = user.app_metadata?.provider || null;

          setUserData({
            fullName,
            avatarUrl,
            email,
            createdAt,
            provider,
          });
        }
      } catch (error) {
        console.error(error);
        setUserData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const containerStyle = isDarkTheme ? styles.darkContainer : styles.lightContainer;
  const textStyle = isDarkTheme ? styles.darkText : styles.lightText;
  const profilePlaceholderStyle = isDarkTheme ? styles.darkProfilePlaceholder : styles.lightProfilePlaceholder;

  return (
    <View style={[styles.container, containerStyle]}>
      {loading ? (
        <ActivityIndicator size="large" color={isDarkTheme ? '#ffffff' : '#0000ff'} />
      ) : userData ? (
        <>
          {userData.avatarUrl ? (
            <Image source={{ uri: userData.avatarUrl }} style={styles.profileImage} />
          ) : (
            <View style={[styles.profilePlaceholder, profilePlaceholderStyle]}>
              <Text style={[styles.profilePlaceholderText, textStyle]}>No Profile Picture</Text>
            </View>
          )}

          <View style={styles.infoContainer}>
            <Text style={[styles.label, textStyle]}>Name:</Text>
            <Text style={[styles.infoText, textStyle]}>{userData.fullName || 'N/A'}</Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={[styles.label, textStyle]}>Email:</Text>
            <Text style={[styles.infoText, textStyle]}>{userData.email || 'N/A'}</Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={[styles.label, textStyle]}>Created at:</Text>
            <Text style={[styles.infoText, textStyle]}>
              {userData.createdAt ? new Date(userData.createdAt).toLocaleString() : 'N/A'}
            </Text>
          </View>

          <View style={styles.infoContainer}>
            <Text style={[styles.label, textStyle]}>Provider:</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              {userData.provider === 'google' && (
                <>
                  <Icon name="google" size={18} color={isDarkTheme ? '#fff' : '#4285F4'} />
                  <View style={{ width: 6 }} />
                </>
              )}
              {userData.provider === 'apple' && (
                <>
                  <Icon name="apple" size={18} color={isDarkTheme ? '#fff' : '#000'} />
                  <View style={{ width: 6 }} />
                </>
              )}
              {userData.provider === 'facebook' && (
                <>
                  <Icon name="facebook" size={18} color="#4267B2" />
                  <View style={{ width: 6 }} />
                </>
              )}
              {!userData.provider && (
                <>
                  <Icon name="envelope" size={18} color={isDarkTheme ? '#fff' : '#666'} />
                  <View style={{ width: 6 }} />
                  <Text style={[styles.infoText, textStyle]}>N/A</Text>
                </>
              )}
             
            </View>
          </View>
        </>
      ) : (
        <Text style={textStyle}>Error, while getting User info</Text>
      )}

      <View style={styles.navigationBarContainer}>
        <NavigationBar
          toggleTheme={() => {}}
          isDarkTheme={isDarkTheme}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  lightContainer: {
    backgroundColor: '#ffffff',
  },
  darkContainer: {
    backgroundColor: '#000000',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
  },
  backButtonText: {
    marginLeft: 5,
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  lightText: {
    color: '#000000',
  },
  darkText: {
    color: '#ffffff',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    marginBottom: 20,
  },
  profilePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  lightProfilePlaceholder: {
    backgroundColor: '#cccccc',
  },
  darkProfilePlaceholder: {
    backgroundColor: '#444444',
  },
  profilePlaceholderText: {
    textAlign: 'center',
  },
  infoContainer: {
    marginBottom: 15,
  },
  label: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  infoText: {
    fontSize: 16,
    marginTop: 4,
  },
  navigationBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});

export default ProfileSettingsPage;
