// src/hooks/usePlatform.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Platform types
export type Platform = 'desktop' | 'mobile' | 'webview';

// Platform context type
interface PlatformContextType {
  platform: Platform;
  isMobile: boolean;
  isDesktop: boolean;
  isWebView: boolean;
  userAgent: string;
}

// Create context
const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

// Platform detection utilities
const detectPlatform = (): Platform => {
  const userAgent = navigator.userAgent.toLowerCase();
  const urlParams = new URLSearchParams(window.location.search);
  
  // Check for webview indicators
  const isWebView = checkIsWebView(userAgent, urlParams);
  if (isWebView) {
    return 'webview';
  }
  
  // Check for mobile
  const isMobile = checkIsMobile(userAgent);
  if (isMobile) {
    return 'mobile';
  }
  
  // Default to desktop
  return 'desktop';
};

const checkIsWebView = (userAgent: string, urlParams: URLSearchParams): boolean => {
  // Check URL parameters for webview indicators
  if (urlParams.has('aos_temp_token')) {
    return true;
  }
  
  // Check for saved webview tokens
  const hasWebViewTokens = localStorage.getItem('core_token') && 
                          localStorage.getItem('supabase_token') &&
                          localStorage.getItem('is_webview') === 'true';
  if (hasWebViewTokens) {
    return true;
  }
  
  // Check user agent for webview indicators
  const webViewIndicators = [
    'augmentos',
    'mentraos',
    'wv',
    'webview',
    // iOS WebView
    '(iphone|ipod|ipad).*applewebkit(?!.*safari)',
    // Android WebView
    'android.*version.*chrome.*(?!.*chrome/)',
    // Windows Phone WebView
    'windows phone.*(?!.*edge)'
  ];
  
  return webViewIndicators.some(indicator => 
    new RegExp(indicator, 'i').test(userAgent)
  );
};

const checkIsMobile = (userAgent: string): boolean => {
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i;
  return mobileRegex.test(userAgent) || 
         ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0);
};

// Platform Provider component
export function PlatformProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());
  const userAgent = navigator.userAgent;
  
  useEffect(() => {
    // Re-detect platform if needed (e.g., when webview injects tokens)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'is_webview' || e.key === 'core_token' || e.key === 'supabase_token') {
        setPlatform(detectPlatform());
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also listen for webview token injections
    const originalSetSupabaseToken = (window as any).setSupabaseToken;
    const originalSetCoreToken = (window as any).setCoreToken;
    
    (window as any).setSupabaseToken = function(...args: any[]) {
      localStorage.setItem('is_webview', 'true');
      setPlatform('webview');
      if (originalSetSupabaseToken) {
        originalSetSupabaseToken.apply(window, args);
      }
    };
    
    (window as any).setCoreToken = function(...args: any[]) {
      localStorage.setItem('is_webview', 'true');
      setPlatform('webview');
      if (originalSetCoreToken) {
        originalSetCoreToken.apply(window, args);
      }
    };
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      (window as any).setSupabaseToken = originalSetSupabaseToken;
      (window as any).setCoreToken = originalSetCoreToken;
    };
  }, []);
  
  const value: PlatformContextType = {
    platform,
    isMobile: platform === 'mobile',
    isDesktop: platform === 'desktop',
    isWebView: platform === 'webview',
    userAgent
  };
  
  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

// Custom hook to use platform context
export function usePlatform() {
  const context = useContext(PlatformContext);
  if (context === undefined) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
}