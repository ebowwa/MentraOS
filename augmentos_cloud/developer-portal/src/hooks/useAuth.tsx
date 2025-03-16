// src/hooks/useAuth.tsx
import { useState, useEffect, createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../utils/supabase';
import axios from 'axios';

// Define the types for our auth context
interface AuthContextType {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  supabaseToken: string | null;
  coreToken: string | null;
  signOut: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the provider component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [supabaseToken, setSupabaseToken] = useState<string | null>(null);
  const [coreToken, setCoreToken] = useState<string | null>(null);

  // Set up axios authorization with token
  const setupAxiosAuth = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  // Handle sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setupAxiosAuth(null);
    setSupabaseToken(null);
    setCoreToken(null);
    localStorage.removeItem('core_token');
  };

  // Function to exchange Supabase token for Core token
  const exchangeForCoreToken = async (supabaseToken: string) => {
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8002'}/api/auth/exchange-token`,
        { supabaseToken },
        { headers: { 'Content-Type': 'application/json' } }
      );
      
      if (response.status === 200 && response.data.coreToken) {
        console.log('Successfully exchanged token for Core token');
        setupAxiosAuth(response.data.coreToken);
        setCoreToken(response.data.coreToken);
        localStorage.setItem('core_token', response.data.coreToken);
        return response.data.coreToken;
      } else {
        throw new Error(`Failed to exchange token: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to exchange token:', error);
      // Fall back to using Supabase token if exchange fails
      setupAxiosAuth(supabaseToken);
      return null;
    }
  };

  useEffect(() => {
    // Get initial session from Supabase
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // Try to use existing core token first
        const savedCoreToken = localStorage.getItem('core_token');
        if (savedCoreToken) {
          console.log('Using saved core token');
          setupAxiosAuth(savedCoreToken);
          setCoreToken(savedCoreToken);
        }
        
        // Get current session
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
        setUser(data.session?.user || null);
        
        if (data.session?.access_token) {
          setSupabaseToken(data.session.access_token);
          
          // If no core token, try to exchange for one
          if (!savedCoreToken) {
            try {
              await exchangeForCoreToken(data.session.access_token);
            } catch (error) {
              console.error('Could not exchange token, using Supabase token as fallback');
              setupAxiosAuth(data.session.access_token);
            }
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);
        setUser(session?.user || null);

        if (event === 'SIGNED_IN' && session?.access_token) {
          setSupabaseToken(session.access_token);
          
          // Exchange for Core token on sign in
          try {
            await exchangeForCoreToken(session.access_token);
          } catch (error) {
            console.error('Could not exchange token on sign-in, using Supabase token as fallback');
            setupAxiosAuth(session.access_token);
          }
        } else if (event === 'SIGNED_OUT') {
          setupAxiosAuth(null);
          setSupabaseToken(null);
          setCoreToken(null);
          localStorage.removeItem('core_token');
        }
      }
    );

    // Clean up subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Calculate authenticated state
  const isAuthenticated = !!user && !!session;

  // Provide auth context to children components
  return (
    <AuthContext.Provider value={{
      session,
      user,
      isLoading,
      isAuthenticated,
      supabaseToken,
      coreToken,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}