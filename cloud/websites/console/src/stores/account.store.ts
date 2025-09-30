/**
 * account.store.ts
 *
 * Placeholder Zustand store for Console account/auth state.
 * This provides a minimal structure and TODOs to finalize during API migration.
 *
 * Responsibilities:
 * - Hold session user info (email) and simple auth flags (signedIn, loading, error).
 * - Provide actions to set the Authorization token header, fetch the signed-in user, and sign out.
 *
 * Notes:
 * - The Cloud backend is responsible for ensuring a default org exists at auth and/or org-required actions.
 * - This store should NOT create organizations. It only reflects account state on the client.
 * - While migrating to /api/console, prefer GET /api/console/auth/me; keep a legacy fallback if needed.
 */

import axios from "axios";
import { create } from "zustand";

export type AccountState = {
  email: string | null;
  signedIn: boolean;
  loading: boolean;
  error: string | null;
};

export type AccountActions = {
  /**
   * Set or clear the Authorization header for subsequent API requests.
   * Pass a JWT ("core token"). When null, clears the header.
   */
  setToken: (token: string | null) => void;

  /**
   * Fetch the currently authenticated user.
   * TODO: Confirm final endpoint under /api/console/auth/me and remove legacy fallback.
   */
  fetchMe: () => Promise<void>;

  /**
   * Clear in-memory account state and remove Authorization header.
   * TODO: If you persist tokens outside this store (e.g., cookies or another store), clear them there as well.
   */
  signOut: () => void;

  /**
   * Internal util to set an error (optional external usage).
   */
  setError: (message: string | null) => void;
};

export type AccountStore = AccountState & AccountActions;

export const useAccountStore = create<AccountStore>((set, _get) => ({
  // State
  email: null,
  signedIn: false,
  loading: false,
  error: null,

  // Actions
  setToken: (token: string | null) => {
    // TODO: If the token is also persisted in another place, sync that here.
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  },

  fetchMe: async () => {
    // TODO:
    // - Prefer /api/console/auth/me once available server-side
    // - Remove legacy fallback (/api/dev/auth/me)
    // - Align response shape (email, organizations, defaultOrg, etc)
    set({ loading: true, error: null });
    try {
      // Try the target route first
      const res = await axios.get("/api/console/auth/me").catch((err) => {
        // Legacy fallback (remove once /api/console is live)
        if (err?.response?.status === 404) {
          return axios.get("/api/dev/auth/me");
        }
        throw err;
      });

      const email: string | null =
        res?.data?.email ??
        res?.data?.data?.email ?? // in case of different shapes
        null;

      set({
        email,
        signedIn: Boolean(email),
        loading: false,
        error: null,
      });
    } catch (error: any) {
      // TODO: unify error formatting
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch account";
      set({
        loading: false,
        signedIn: false,
        email: null,
        error: message,
      });
    }
  },

  signOut: () => {
    // Clear in-memory state
    set({
      email: null,
      signedIn: false,
      loading: false,
      error: null,
    });

    // Clear Authorization header
    delete axios.defaults.headers.common["Authorization"];

    // TODO:
    // - If tokens/cookies are managed elsewhere, clear them there as well.
    // - Consider redirect or UI flow after sign-out.
  },

  setError: (message: string | null) => set({ error: message }),
}));

/**
 * Selectors (example usage):
 * const email = useAccountStore(s => s.email)
 * const loading = useAccountStore(s => s.loading)
 * const signedIn = useAccountStore(s => s.signedIn)
 *
 * Initialization (example):
 * - Call useAccountStore.getState().setToken(token) after login.
 * - Then await useAccountStore.getState().fetchMe() to populate account state.
 */
