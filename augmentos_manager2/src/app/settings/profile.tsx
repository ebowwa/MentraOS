import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Image, TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle, ImageStyle } from 'react-native';
// import { launchImageLibrary } from 'react-native-image-picker';
import NavigationBar from '@/components/misc/NavigationBar';
import { supabase } from '@/supabase/supabaseClient';
import { useAppTheme } from '@/utils/useAppTheme';
import { ThemedStyle } from '@/theme';

export default function ProfileSettingsPage() {
  const [displayName, setDisplayName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const {theme, themed} = useAppTheme();
  const handleUpdateProfile = async () => {
    setLoading(true);
    setTimeout(() => {
      alert('Profile updated successfully');
      setLoading(false);
    }, 1000);
  };

  const pickImage = async () => {
    // const result = await launchImageLibrary({
    //   mediaType: 'photo',
    //   quality: 1,
    // });

    // if (!result.didCancel && result.assets && result.assets.length > 0) {
    //   const { uri } = result.assets[0];
    //   if (uri) {
    //     setProfilePicture(uri);
    //   }
    // }
  };

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error(error);
      // Handle sign-out error
    } else {
      console.log('Sign-out successful');
    }
  }
  

  return (
    <View style={themed($container)}>
      <Text style={themed($title)}>Profile Settings</Text>

      <TouchableOpacity onPress={pickImage}>
        {profilePicture ? (
          <Image source={{ uri: profilePicture }} style={themed($profileImage)} />
        ) : (
          <View style={themed($profilePlaceholder)}>
            <Text style={themed($profilePlaceholderText)}>Pick a Profile Picture</Text>
          </View>
        )}
      </TouchableOpacity>

      <TextInput
        style={themed($input)}
        placeholder="Display Name"
        placeholderTextColor={theme.colors.text}
        value={displayName}
        onChangeText={setDisplayName}
      />

      <TextInput
        style={themed($input)}
        placeholder="Email"
        placeholderTextColor={theme.colors.text}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />

      <Button title="Update Profile" onPress={handleUpdateProfile} disabled={loading} />
      {loading && <ActivityIndicator size="large" color={theme.colors.text} />}

      <View style={styles.navigationBarContainer}>
        <NavigationBar
          toggleTheme={() => {}}
        />
      </View>
    </View>
  );
};

const $container: ThemedStyle<ViewStyle> = ({colors}) => ({
  flex: 1,
  padding: 20,
  justifyContent: 'center',
  backgroundColor: colors.palette.neutral300,
})

const $title: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $profileImage: ThemedStyle<ImageStyle> = ({colors}) => ({
  width: 100,
  height: 100,
  borderRadius: 50,
  alignSelf: 'center',
  marginBottom: 20,
})

const $profilePlaceholder: ThemedStyle<ViewStyle> = ({colors}) => ({
  width: 100,
  height: 100,
  borderRadius: 50,
  justifyContent: 'center',
  alignItems: 'center',
})

const $profilePlaceholderText: ThemedStyle<TextStyle> = ({colors}) => ({
  color: colors.text,
})

const $input: ThemedStyle<TextStyle> = ({colors}) => ({
  borderBottomWidth: 1,
  marginBottom: 20,
  paddingVertical: 10,
  paddingHorizontal: 15,
  fontSize: 16,
})

const $button: ThemedStyle<ViewStyle> = ({colors}) => ({
  backgroundColor: colors.palette.primary100,
  padding: 10,
  borderRadius: 5,
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  lightContainer: {
    backgroundColor: '#ffffff',
  },
  darkContainer: {
    backgroundColor: '#000000',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
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
  input: {
    borderBottomWidth: 1,
    marginBottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  lightInput: {
    borderColor: '#cccccc',
  },
  darkInput: {
    borderColor: '#777777',
  },
  navigationBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});