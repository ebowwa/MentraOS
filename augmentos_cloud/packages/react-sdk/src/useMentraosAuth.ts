// react-sdk/src/useMentraosAuth.ts
import { useContext } from 'react';
import { MentraosAuthContext, MentraosAuthContextType } from './AuthProvider';

/**
 * Custom hook to access the MentraOS authentication context.
 *
 * @returns {MentraosAuthContextType} The authentication context containing user state,
 * loading status, error information, and authentication methods.
 *
 * @throws {Error} When used outside of an MentraosAuthProvider component.
 *
 * @example
 * ```tsx
 * const { userId, isAuthenticated, logout, isLoading } = useMentraosAuth();
 * ```
 */
export const useMentraosAuth = (): MentraosAuthContextType => {
  const context = useContext(MentraosAuthContext);
  if (context === undefined) {
    throw new Error('useMentraosAuth must be used within an MentraosAuthProvider');
  }
  return context;
};