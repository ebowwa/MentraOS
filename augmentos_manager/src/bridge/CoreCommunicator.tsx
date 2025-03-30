// This file serves as a platform-independent interface for CoreCommunicator
// React Native will automatically resolve to the correct platform-specific implementation
// based on the extension (.ios.tsx or .android.tsx)

// Export the default instance from the platform-specific implementation
export { default } from './CoreCommunicator.ios';

// Also export the class if needed
export { CoreCommunicator } from './CoreCommunicator.ios';