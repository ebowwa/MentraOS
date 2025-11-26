import { createStore } from "zustand/vanilla";
import { AppletInterface } from "@mentra/types";

export interface AppletState {
    installedApps: AppletInterface[];
    runningApps: string[];
    foregroundApp: string | null;

    setInstalledApps: (apps: AppletInterface[]) => void;
    setRunningApps: (apps: string[]) => void;
    setForegroundApp: (app: string | null) => void;

    addRunningApp: (app: string) => void;
    removeRunningApp: (app: string) => void;
}

export const createAppletStore = () => {
    return createStore<AppletState>((set) => ({
        installedApps: [],
        runningApps: [],
        foregroundApp: null,

        setInstalledApps: (apps) => set({ installedApps: apps }),
        setRunningApps: (apps) => set({ runningApps: apps }),
        setForegroundApp: (app) => set({ foregroundApp: app }),

        addRunningApp: (app) => set((state) => ({
            runningApps: [...state.runningApps, app]
        })),

        removeRunningApp: (app) => set((state) => ({
            runningApps: state.runningApps.filter(a => a !== app),
            foregroundApp: state.foregroundApp === app ? null : state.foregroundApp
        })),
    }));
};
