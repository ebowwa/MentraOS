import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { AugmentOSParser, AugmentOSMainStatus } from '../AugmentOSStatusParser.tsx';
import { INTENSE_LOGGING, MOCK_CONNECTION } from '../consts.tsx';
import GlobalEventEmitter from "../logic/GlobalEventEmitter.tsx";
import BackendServerComms from '../backend_comms/BackendServerComms';
import { useAuth } from '../AuthContext';
import coreCommunicator from '../bridge/CoreCommunicator';

// Define the base AppInfo type
interface AppInfo {
    packageName: string;
    name: string;
    is_running: boolean;
    is_foreground: boolean;
}

// Extend AppInfo with timestamp
interface AppWithTimestamp extends AppInfo {
    lastUpdated?: number;
}

// Define the status type with timestamped apps
interface AugmentOSMainStatusWithTimestamps {
    core_info: AugmentOSMainStatus['core_info'];
    glasses_info: AugmentOSMainStatus['glasses_info'];
    wifi: AugmentOSMainStatus['wifi'];
    gsm: AugmentOSMainStatus['gsm'];
    apps: AppWithTimestamp[];
    auth: AugmentOSMainStatus['auth'];
}

interface AugmentOSStatusContextType {
    status: AugmentOSMainStatusWithTimestamps;
    initializeCoreConnection: () => void;
    refreshStatus: (data: any) => void;
    screenMirrorItems: { id: string; name: string }[]
    getCoreToken: () => string | null;
    updateAppStatus: (packageName: string, isRunning: boolean, isForeground?: boolean) => void;
}

const AugmentOSStatusContext = createContext<AugmentOSStatusContextType | undefined>(undefined);

export const StatusProvider = ({ children }: { children: ReactNode }) => {
    const [status, setStatus] = useState<AugmentOSMainStatusWithTimestamps>(() => {
        const initialStatus = AugmentOSParser.parseStatus({});
        return {
            ...initialStatus,
            apps: initialStatus.apps.map(app => ({ ...app, lastUpdated: undefined }))
        };
    });
    const [isInitialized, setIsInitialized] = useState(false);
    const [screenMirrorItems, setScreenMirrorItems] = useState<{ id: string; name: string }[]>([]);
    
    const refreshStatus = useCallback((data: any) => {
        if (!(data && 'status' in data)) {return;}

        const parsedStatus = AugmentOSParser.parseStatus(data);
        if (INTENSE_LOGGING)
            console.log('Parsed status:', parsedStatus);
        
        setStatus(prevStatus => {
            // Create a new status object that preserves optimistic updates
            const newStatus: AugmentOSMainStatusWithTimestamps = {
                ...parsedStatus,
                apps: parsedStatus.apps.map(app => ({ ...app, lastUpdated: undefined }))
            };
            
            // For each app in the current status, check if it has a more recent update
            prevStatus.apps.forEach(prevApp => {
                const newAppIndex = newStatus.apps.findIndex(a => a.packageName === prevApp.packageName);
                if (newAppIndex !== -1) {
                    const newApp = newStatus.apps[newAppIndex];
                    // If the current app has a more recent update, preserve its state
                    if (prevApp.lastUpdated && (!newApp.lastUpdated || prevApp.lastUpdated > newApp.lastUpdated)) {
                        newStatus.apps[newAppIndex] = {
                            ...newApp,
                            is_running: prevApp.is_running,
                            is_foreground: prevApp.is_foreground,
                            lastUpdated: prevApp.lastUpdated
                        };
                    }
                }
            });
            
            return newStatus;
        });
    }, []);

    // Add user as a dependency to trigger re-initialization after login
    const { user } = useAuth();

    useEffect(() => {
        // Force a complete reset of status during sign-out/sign-in transition
        if (!user) {
            console.log('User signed out, resetting status');
            setStatus(AugmentOSParser.defaultStatus);
            return;
        }

        if (!isInitialized) return;

        // Log the status provider re-initialization for debugging
        console.log('STATUS PROVIDER: Initializing event listeners for user:', user?.email);

        const handleStatusUpdateReceived = (data: any) => {
            if (INTENSE_LOGGING)
                console.log('Handling received data.. refreshing status..');
            refreshStatus(data);
        };

        const handleDeviceDisconnected = () => {
            console.log('Core disconnected');
            setStatus(AugmentOSParser.defaultStatus);
        };

        if (!MOCK_CONNECTION) {
            // First, ensure we're not double-registering by removing any existing listeners
            coreCommunicator.removeAllListeners('statusUpdateReceived');
            coreCommunicator.removeAllListeners('dataReceived');
            GlobalEventEmitter.removeAllListeners('STATUS_PARSE_ERROR');
            
            // Register fresh listeners
            coreCommunicator.on('statusUpdateReceived', handleStatusUpdateReceived);
            GlobalEventEmitter.on('STATUS_PARSE_ERROR', handleDeviceDisconnected);
            
            console.log('STATUS PROVIDER: Event listeners registered successfully');
            
            // Force a status request to update UI immediately
            setTimeout(() => {
                coreCommunicator.sendRequestStatus();
            }, 1000);
        }

        return () => {
            if (!MOCK_CONNECTION) {
                coreCommunicator.removeListener('statusUpdateReceived', handleStatusUpdateReceived);
                GlobalEventEmitter.removeListener('STATUS_PARSE_ERROR', handleDeviceDisconnected);
                console.log('STATUS PROVIDER: Event listeners cleaned up');
            }
        };
    }, [refreshStatus, isInitialized, user]); // Added user dependency

    // Initialize the Core communication
    const initializeCoreConnection = React.useCallback(() => {
        console.log("Initializing Core communication");
        coreCommunicator.initialize();
        setIsInitialized(true);
    }, []);
    
    // Helper to get coreToken (directly returns from BackendServerComms)
    const getCoreToken = useCallback(() => {
        return BackendServerComms.getInstance().getCoreToken();
    }, []);

    // Update the updateAppStatus function to include timestamps
    const updateAppStatus = useCallback((packageName: string, isRunning: boolean, isForeground: boolean = true) => {
        setStatus(prevStatus => {
            const now = Date.now();
            // Create a new copy of the apps array with the updated app
            const updatedApps = prevStatus.apps.map(app => {
                if (app.packageName === packageName) {
                    return { 
                        ...app, 
                        is_running: isRunning, 
                        is_foreground: isForeground,
                        lastUpdated: now
                    };
                }
                // If setting a new foreground app, make sure other apps aren't foreground
                if (isForeground && isRunning && app.is_foreground) {
                    return { 
                        ...app, 
                        is_foreground: false,
                        lastUpdated: now
                    };
                }
                return app;
            });
            
            // Return a new status object with the updated apps
            return { ...prevStatus, apps: updatedApps };
        });
    }, []);

    return (
        <AugmentOSStatusContext.Provider value={{ 
            initializeCoreConnection,
            screenMirrorItems, 
            status, 
            refreshStatus,
            getCoreToken,
            updateAppStatus
        }}>
            {children}
        </AugmentOSStatusContext.Provider>
    );
};

export const useStatus = () => {
    const context = useContext(AugmentOSStatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
};