/**
 * app.store.ts
 *
 * Placeholder Zustand store for Console applications.
 * - Normalized state: appsByPackage (map) + list (ordered package names)
 * - Minimal actions with legacy (/api/dev/*) and target (/api/console/*) endpoints
 * - No hard dependency on org store; relies on global "x-org-id" header if orgId is not provided
 *
 * Notes:
 * - While migrating, prefer target endpoints first and fallback to legacy when 404.
 * - org.store should set axios.defaults.headers["x-org-id"] when the selected org changes.
 * - New /api/console routes may carry orgId in query/body; legacy uses "x-org-id" header.
 */

import axios from "axios";
import { create } from "zustand";

export type AppStoreStatus =
  | "DEVELOPMENT"
  | "SUBMITTED"
  | "REJECTED"
  | "PUBLISHED";

export type AppResponse = {
  packageName: string;
  name?: string;
  description?: string;
  publicUrl?: string;
  appStoreStatus?: AppStoreStatus;
  createdAt?: string;
  updatedAt?: string;
  // Allow additional fields without strict typing during migration
  [key: string]: any;
};

export type AppState = {
  appsByPackage: Record<string, AppResponse>;
  list: string[]; // ordered packageNames for current view
  loading: boolean;
  error: string | null;
  lastFetchedAt: number | null;
};

export type AppActions = {
  /**
   * Fetch apps for the current org context.
   * - Target: GET /api/console/apps?orgId=<id>
   * - Legacy: GET /api/dev/apps (x-org-id header)
   */
  fetchApps: (params?: { orgId?: string }) => Promise<void>;

  /**
   * Fetch a single app by package name.
   * - Target: GET /api/console/app/:packageName
   * - Legacy: GET /api/dev/apps/:packageName
   */
  getApp: (
    packageName: string,
    params?: { orgId?: string },
  ) => Promise<AppResponse | null>;

  /**
   * Create a new app.
   * - Target: POST /api/console/apps (body may include orgId)
   * - Legacy: POST /api/dev/apps/register (x-org-id header)
   * Returns: { app, apiKey? }
   */
  createApp: (
    data: Record<string, any>,
    params?: { orgId?: string },
  ) => Promise<{ app: AppResponse; apiKey?: string }>;

  /**
   * Update an existing app by package name.
   * - Target: PUT /api/console/app/:packageName
   * - Legacy: PUT /api/dev/apps/:packageName
   */
  updateApp: (
    packageName: string,
    data: Record<string, any>,
    params?: { orgId?: string },
  ) => Promise<AppResponse>;

  /**
   * Delete an app by package name.
   * - Target: DELETE /api/console/app/:packageName
   * - Legacy: DELETE /api/dev/apps/:packageName
   */
  deleteApp: (
    packageName: string,
    params?: { orgId?: string },
  ) => Promise<void>;

  /**
   * Publish an app by package name.
   * - Target: POST /api/console/app/:packageName/publish
   * - Legacy: POST /api/dev/apps/:packageName/publish
   */
  publishApp: (
    packageName: string,
    params?: { orgId?: string },
  ) => Promise<AppResponse>;

  /**
   * Regenerate API key for app by package name.
   * - Target: POST /api/console/app/:packageName/api-key
   * - Legacy: POST /api/dev/apps/:packageName/api-key
   * Returns: { apiKey, createdAt? }
   */
  regenerateApiKey: (
    packageName: string,
    params?: { orgId?: string },
  ) => Promise<{ apiKey: string; createdAt?: string }>;

  /**
   * Move an app to a different organization.
   * - Target: POST /api/console/app/:packageName/move { targetOrgId }
   * - Legacy: POST /api/dev/apps/:packageName/move-org { targetOrgId } (x-org-id header = source)
   */
  moveApp: (
    packageName: string,
    targetOrgId: string,
    params?: { sourceOrgId?: string },
  ) => Promise<AppResponse>;

  clearError: () => void;
};

export type AppStore = AppState & AppActions;

function normalizeApp(raw: any): AppResponse {
  if (!raw || typeof raw !== "object") return { packageName: "" };
  // Accept various shapes; prefer canonical fields
  return {
    packageName: raw.packageName || raw.id || raw.pkg || "",
    name: raw.name,
    description: raw.description,
    publicUrl: raw.publicUrl,
    appStoreStatus: raw.appStoreStatus,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...raw,
  };
}

function normalizeAppArray(raw: any): AppResponse[] {
  const arr = Array.isArray(raw) ? raw : raw?.data || [];
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeApp).filter((a) => a.packageName);
}

function mergeApps(state: AppState, apps: AppResponse[]): AppState {
  const next = { ...state.appsByPackage };
  const order: string[] = [];
  for (const app of apps) {
    next[app.packageName] = { ...(next[app.packageName] || {}), ...app };
    order.push(app.packageName);
  }
  return {
    ...state,
    appsByPackage: next,
    list: order,
    lastFetchedAt: Date.now(),
  };
}

export const useAppStore = create<AppStore>((set, _get) => ({
  // State
  appsByPackage: {},
  list: [],
  loading: false,
  error: null,
  lastFetchedAt: null,

  // Actions
  fetchApps: async (params) => {
    const orgId = params?.orgId;
    set({ loading: true, error: null });
    try {
      // Prefer target route; fallback to legacy during migration
      const res = await axios
        .get("/api/console/apps", { params: orgId ? { orgId } : undefined })
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.get("/api/dev/apps");
          }
          throw err;
        });

      const apps = normalizeAppArray(res.data);
      set((s) => ({ ...mergeApps(s, apps), loading: false, error: null }));
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch apps";
      set({ loading: false, error: message });
    }
  },

  getApp: async (packageName, _params) => {
    set({ loading: true, error: null });
    try {
      // Prefer target route; fallback to legacy during migration
      const res = await axios
        .get(`/api/console/app/${encodeURIComponent(packageName)}`)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.get(
              `/api/dev/apps/${encodeURIComponent(packageName)}`,
            );
          }
          throw err;
        });

      const app = normalizeApp(res.data?.data ?? res.data);
      if (app.packageName) {
        set((s) => ({
          loading: false,
          error: null,
          appsByPackage: {
            ...s.appsByPackage,
            [app.packageName]: {
              ...(s.appsByPackage[app.packageName] || {}),
              ...app,
            },
          },
          list: s.list.includes(app.packageName)
            ? s.list
            : [...s.list, app.packageName],
        }));
      } else {
        set({ loading: false });
      }
      return app.packageName ? app : null;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch app";
      set({ loading: false, error: message });
      return null;
    }
  },

  createApp: async (data, params) => {
    const orgId = params?.orgId;
    set({ loading: true, error: null });
    try {
      // Prefer target route; fallback to legacy during migration
      const res = await axios
        .post("/api/console/apps", orgId ? { ...data, orgId } : data)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.post("/api/dev/apps/register", data);
          }
          throw err;
        });

      // Target might return { success, data: { app, apiKey? } } or directly { app, apiKey }
      const payload = res.data?.data ?? res.data ?? {};
      const rawApp = payload.app ?? payload;
      const app = normalizeApp(rawApp);
      const apiKey: string | undefined = payload.apiKey;

      if (app.packageName) {
        set((s) => ({
          loading: false,
          error: null,
          appsByPackage: {
            ...s.appsByPackage,
            [app.packageName]: {
              ...(s.appsByPackage[app.packageName] || {}),
              ...app,
            },
          },
          list: s.list.includes(app.packageName)
            ? s.list
            : [app.packageName, ...s.list],
        }));
      } else {
        set({ loading: false });
      }

      return { app, apiKey };
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create app";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  updateApp: async (packageName, data, _params) => {
    set({ loading: true, error: null });
    try {
      const res = await axios
        .put(`/api/console/app/${encodeURIComponent(packageName)}`, data)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.put(
              `/api/dev/apps/${encodeURIComponent(packageName)}`,
              data,
            );
          }
          throw err;
        });

      const app = normalizeApp(res.data?.data ?? res.data);
      if (app.packageName) {
        set((s) => ({
          loading: false,
          error: null,
          appsByPackage: {
            ...s.appsByPackage,
            [app.packageName]: {
              ...(s.appsByPackage[app.packageName] || {}),
              ...app,
            },
          },
          list: s.list.includes(app.packageName)
            ? s.list
            : [...s.list, app.packageName],
        }));
      } else {
        set({ loading: false });
      }

      return app;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to update app";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  deleteApp: async (packageName, _params) => {
    set({ loading: true, error: null });
    try {
      await axios
        .delete(`/api/console/app/${encodeURIComponent(packageName)}`)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.delete(
              `/api/dev/apps/${encodeURIComponent(packageName)}`,
            );
          }
          throw err;
        });

      set((s) => {
        const next = { ...s.appsByPackage };
        delete next[packageName];
        return {
          loading: false,
          error: null,
          appsByPackage: next,
          list: s.list.filter((p) => p !== packageName),
        };
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to delete app";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  publishApp: async (packageName, _params) => {
    set({ loading: true, error: null });
    try {
      const res = await axios
        .post(`/api/console/app/${encodeURIComponent(packageName)}/publish`)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.post(
              `/api/dev/apps/${encodeURIComponent(packageName)}/publish`,
            );
          }
          throw err;
        });

      const app = normalizeApp(res.data?.data ?? res.data);
      if (app.packageName) {
        set((s) => ({
          loading: false,
          error: null,
          appsByPackage: {
            ...s.appsByPackage,
            [app.packageName]: {
              ...(s.appsByPackage[app.packageName] || {}),
              ...app,
            },
          },
          list: s.list.includes(app.packageName)
            ? s.list
            : [...s.list, app.packageName],
        }));
      } else {
        set({ loading: false });
      }
      return app;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to publish app";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  regenerateApiKey: async (packageName, _params) => {
    set({ loading: true, error: null });
    try {
      const res = await axios
        .post(`/api/console/app/${encodeURIComponent(packageName)}/api-key`)
        .catch((err) => {
          if (err?.response?.status === 404) {
            return axios.post(
              `/api/dev/apps/${encodeURIComponent(packageName)}/api-key`,
            );
          }
          throw err;
        });

      const payload = res.data?.data ?? res.data ?? {};
      const apiKey: string = payload.apiKey ?? payload?.data?.apiKey;
      const createdAt: string | undefined =
        payload.createdAt ?? payload?.data?.createdAt;

      set({ loading: false, error: null });
      return { apiKey, createdAt };
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to regenerate API key";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  moveApp: async (packageName, targetOrgId, _params) => {
    set({ loading: true, error: null });
    try {
      // Target route uses body { targetOrgId }
      const res = await axios
        .post(`/api/console/app/${encodeURIComponent(packageName)}/move`, {
          targetOrgId,
        })
        .catch((err) => {
          if (err?.response?.status === 404) {
            // Legacy route: /move-org with body { targetOrgId }, "x-org-id" header as source org
            return axios.post(
              `/api/dev/apps/${encodeURIComponent(packageName)}/move-org`,
              { targetOrgId },
            );
          }
          throw err;
        });

      const app = normalizeApp(res.data?.data ?? res.data);
      if (app.packageName) {
        set((s) => ({
          loading: false,
          error: null,
          appsByPackage: {
            ...s.appsByPackage,
            [app.packageName]: {
              ...(s.appsByPackage[app.packageName] || {}),
              ...app,
            },
          },
          list: s.list.includes(app.packageName)
            ? s.list
            : [...s.list, app.packageName],
        }));
      } else {
        set({ loading: false });
      }
      return app;
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to move app";
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * Usage:
 * const { list, appsByPackage, fetchApps } = useAppStore();
 * await useAppStore.getState().fetchApps(); // relies on global "x-org-id" header set by org.store
 *
 * Notes:
 * - For target routes, you may pass { orgId } to fetchApps() to avoid header reliance:
 *   await useAppStore.getState().fetchApps({ orgId: "..." });
 * - During migration, both patterns are supported.
 */
