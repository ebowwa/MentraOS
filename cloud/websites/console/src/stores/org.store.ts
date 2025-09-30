/**
 * org.store.ts
 *
 * Placeholder Zustand store for Console organizations.
 * - Manages organizations list and the selected organization.
 * - Synchronizes global header "x-org-id" for legacy routes (temporary bridge).
 * - Persists selectedOrgId locally to survive reloads.
 *
 * Notes:
 * - The Cloud backend is responsible for ensuring a default org exists at auth
 *   and/or on org-required actions. The UI does NOT auto-create orgs by policy.
 * - Prefer the target endpoints under /api/console/orgs once available.
 *   Keep a legacy fallback (/api/orgs) until migration completes.
 * - When the selected org changes, we set axios.defaults.headers["x-org-id"]
 *   to avoid breaking existing /api/dev/* routes during migration.
 */

import axios from "axios";
import { create } from "zustand";

const PERSIST_KEY = "console:selectedOrgId";

export type Organization = {
  id: string;
  name: string;
  slug?: string;
  profile?: {
    contactEmail?: string;
    website?: string;
    description?: string;
    logo?: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type OrgState = {
  orgs: Organization[];
  selectedOrgId: string | null;
  loading: boolean;
  error: string | null;
};

export type OrgActions = {
  /**
   * Initialize org state:
   * - Fetch orgs from the backend.
   * - Restore persisted selectedOrgId and validate it; fallback to first org.
   * - Synchronize the global "x-org-id" header if selection is available.
   */
  bootstrap: () => Promise<void>;

  /**
   * Fetch orgs from the backend (target: /api/console/orgs; legacy: /api/orgs).
   */
  loadOrgs: () => Promise<void>;

  /**
   * Change the selected org:
   * - Updates state
   * - Persists to localStorage
   * - Sets axios.defaults.headers["x-org-id"] (temporary bridge)
   */
  setSelectedOrgId: (orgId: string | null) => void;

  /**
   * Create an organization (target: /api/console/orgs; legacy: /api/orgs),
   * append to orgs, and select it.
   */
  createOrg: (name: string) => Promise<void>;

  /**
   * Utility to clear error state.
   */
  clearError: () => void;
};

export type OrgStore = OrgState & OrgActions;

function setGlobalOrgHeader(orgId: string | null) {
  if (orgId) {
    axios.defaults.headers.common["x-org-id"] = orgId;
  } else {
    delete axios.defaults.headers.common["x-org-id"];
  }
}

function persistSelectedOrgId(orgId: string | null) {
  try {
    if (orgId) {
      window.localStorage.setItem(PERSIST_KEY, orgId);
    } else {
      window.localStorage.removeItem(PERSIST_KEY);
    }
  } catch {
    // ignore storage errors (SSR or privacy mode)
  }
}

function readPersistedSelectedOrgId(): string | null {
  try {
    return window.localStorage.getItem(PERSIST_KEY);
  } catch {
    return null;
  }
}

export const useOrgStore = create<OrgStore>((set, get) => ({
  // State
  orgs: [],
  selectedOrgId: null,
  loading: false,
  error: null,

  // Actions
  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      await get().loadOrgs();

      const state = get();
      const persisted = readPersistedSelectedOrgId();

      let selected: string | null = null;
      if (persisted && state.orgs.some((o) => o.id === persisted)) {
        selected = persisted;
      } else {
        selected = state.orgs.length > 0 ? state.orgs[0].id : null;
      }

      set({ selectedOrgId: selected, loading: false });
      setGlobalOrgHeader(selected);
      persistSelectedOrgId(selected);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to initialize organizations";
      set({ loading: false, error: message });
    }
  },

  loadOrgs: async () => {
    set({ loading: true, error: null });
    try {
      // Prefer target route; fallback to legacy during migration
      const res = await axios.get("/api/console/orgs").catch((err) => {
        if (err?.response?.status === 404) {
          return axios.get("/api/orgs");
        }
        throw err;
      });

      // Normalize response: either { success, data: [...] } or [...]
      const data = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      const orgs: Organization[] = (data as any[]).map((raw: any) => ({
        id: raw.id || raw._id || raw.orgId || "",
        name: raw.name || "Unnamed Org",
        slug: raw.slug,
        profile: raw.profile,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      }));

      set({ orgs, loading: false, error: null });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to load organizations";
      set({ loading: false, error: message, orgs: [] });
      // Do not clear selected header here; selection may still be valid for legacy calls
    }
  },

  setSelectedOrgId: (orgId: string | null) => {
    set({ selectedOrgId: orgId });
    setGlobalOrgHeader(orgId);
    persistSelectedOrgId(orgId);
  },

  createOrg: async (name: string) => {
    set({ loading: true, error: null });
    try {
      const body = { name };
      const res = await axios.post("/api/console/orgs", body).catch((err) => {
        if (err?.response?.status === 404) {
          return axios.post("/api/orgs", body);
        }
        throw err;
      });

      // Normalize single org response: either { success, data: {...} } or {...}
      const raw = res.data?.data ?? res.data ?? {};
      const newOrg: Organization = {
        id: raw.id || raw._id || raw.orgId || "",
        name: raw.name || name,
        slug: raw.slug,
        profile: raw.profile,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      };

      const orgs = [...get().orgs, newOrg];
      set({ orgs, selectedOrgId: newOrg.id, loading: false, error: null });
      setGlobalOrgHeader(newOrg.id);
      persistSelectedOrgId(newOrg.id);
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create organization";
      set({ loading: false, error: message });
    }
  },

  clearError: () => set({ error: null }),
}));

/**
 * Usage examples:
 *
 * const { orgs, selectedOrgId, loading } = useOrgStore();
 * const bootstrap = useOrgStore(s => s.bootstrap);
 * const setSelectedOrgId = useOrgStore(s => s.setSelectedOrgId);
 *
 * // App init:
 * await useOrgStore.getState().bootstrap();
 *
 * // Change org:
 * useOrgStore.getState().setSelectedOrgId(newOrgId);
 *
 * // Create org:
 * await useOrgStore.getState().createOrg("Personal Org");
 */
