// This file serves as a platform-independent interface for CoreCommunicator
// We explicitly import the correct platform-specific implementation

import { Platform } from 'react-native';

// Import based on platform
if (Platform.OS === 'ios') {
  module.exports = require('./CoreCommunicator.ios');
} else {
  module.exports = require('./CoreCommunicator.android');
}