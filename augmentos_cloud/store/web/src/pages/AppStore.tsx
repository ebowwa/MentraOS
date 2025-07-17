import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { Search, X, Building, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { usePlatform } from '../hooks/usePlatform';
import api, { AppFilterOptions } from '../api';
import { AppI } from '../types';
import Header from '../components/Header';
import AppCard from '../components/AppCard';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';

// Extend window interface for React Native WebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
  }
}

/**
 * AppStore component that displays and manages available applications
 * Supports filtering by search query and organization ID (via URL parameter)
 */
const AppStore: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const { isWebView } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get organization ID from URL query parameter
  const orgId = searchParams.get('orgId');

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<AppI[]>([]);
  const [installingApp, setInstallingApp] = useState<string | null>(null);
  const [activeOrgFilter, setActiveOrgFilter] = useState<string | null>(orgId);
  const [orgName, setOrgName] = useState<string>('');

  // Fetch apps on component mount or when org filter changes
  useEffect(() => {
    setActiveOrgFilter(orgId);
    fetchApps();
  }, [isAuthenticated, orgId]); // Re-fetch when authentication state or org filter changes

  /**
   * Fetches available apps and installed status
   * Applies organization filter if present in URL
   */
  const fetchApps = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let appList: AppI[] = [];
      let installedApps: AppI[] = [];

      // Get the available apps (public list for everyone)
      try {
        // If organizationId is provided, use it for filtering
        const filterOptions: AppFilterOptions = {};
        if (orgId) {
          filterOptions.organizationId = orgId;
        }

        appList = await api.app.getAvailableApps(orgId ? filterOptions : undefined);

        // If we're filtering by organization, get the organization name from the first app
        if (orgId && appList.length > 0) {
          const firstApp = appList[0];
          if (firstApp.orgName) {
            setOrgName(firstApp.orgName);
          } else {
            // Fallback to a generic name if orgName isn't available
            setOrgName('Selected Organization');
          }
        }
      } catch (err) {
        console.error('Error fetching public apps:', err);
        setError('Failed to load apps. Please try again.');
        return;
      }

      // If authenticated, fetch installed apps and merge with available apps
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          installedApps = await api.app.getInstalledApps();

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>();
          installedApps.forEach(app => {
            installedMap.set(app.packageName, true);
          });

          // Update the available apps with installed status
          appList = appList.map(app => ({
            ...app,
            isInstalled: installedMap.has(app.packageName)
          }));

          console.log('Merged apps with install status:', appList);
        } catch (err) {
          console.error('Error fetching installed apps:', err);
          // Continue with available apps, but without install status
        }
      }

      setApps(appList);
    } catch (err) {
      console.error('Error fetching apps:', err);
      setError('Failed to load apps. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter apps based on search query (client-side filtering now, adjust if needed for server-side)
  const filteredApps = useMemo(() => {
    if (searchQuery.trim() === '') return apps;
    
    const query = searchQuery.toLowerCase();
    return apps.filter(app =>
      app.name.toLowerCase().includes(query) ||
      (app.description && app.description.toLowerCase().includes(query))
    );
  }, [apps, searchQuery]);

  /**
   * Handles search form submission
   * Preserves organization filter when searching
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      fetchApps(); // If search query is empty, reset to all apps
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Search with the organization filter if present
      const filterOptions: AppFilterOptions = {};
      if (orgId) {
        filterOptions.organizationId = orgId;
      }

      const results = await api.app.searchApps(
        searchQuery,
        orgId ? filterOptions : undefined
      );

      // If authenticated, update the search results with installed status
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          const installedApps = await api.app.getInstalledApps();

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>();
          installedApps.forEach(app => {
            installedMap.set(app.packageName, true);
          });

          // Update search results with installed status
          results.forEach(app => {
            app.isInstalled = installedMap.has(app.packageName);
          });
        } catch (err) {
          console.error('Error updating search results with install status:', err);
        }
      }

      setApps(results);
    } catch (err) {
      console.error('Error searching apps:', err);
      toast.error('Failed to search apps');
      setError('Failed to search apps. Please try again.'); // Set error state for UI
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clears the organization filter
   */
  const clearOrgFilter = () => {
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.delete('orgId');
      return newParams;
    });
    setActiveOrgFilter(null);
    setOrgName('');
  };

  // Handle app installation
  const handleInstall = useCallback(async (packageName: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Use the web API
    try {
      setInstallingApp(packageName);

      const success = await api.app.installApp(packageName);

      if (success) {
        toast.success('App installed successfully');

        // Update the app in the list to show as installed
        setApps(prevApps =>
          prevApps.map(app =>
            app.packageName === packageName
              ? { ...app, isInstalled: true, installedDate: new Date().toISOString() }
              : app
          )
        );
      } else {
        toast.error('Failed to install app');
      }
    } catch (err) {
      console.error('Error installing app:', err);
      toast.error('Failed to install app');
    } finally {
      setInstallingApp(null);
    }
  }, [isAuthenticated, navigate]);

  // Handle app uninstallation
  const handleUninstall = useCallback(async (packageName: string) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    try {
      console.log('Uninstalling app:', packageName);
      setInstallingApp(packageName);

      const success = await api.app.uninstallApp(packageName);

      if (success) {
        toast.success('App uninstalled successfully');

        // Update the app in the list to show as uninstalled
        setApps(prevApps =>
          prevApps.map(app =>
            app.packageName === packageName
              ? { ...app, isInstalled: false, installedDate: undefined }
              : app
          )
        );
      } else {
        toast.error('Failed to uninstall app');
      }
    } catch (err) {
      console.error('Error uninstalling app:', err);
      toast.error('Failed to uninstall app');
    } finally {
      setInstallingApp(null);
    }
  }, [isAuthenticated, navigate]);

  const handleOpen = useCallback((packageName: string) => {
    // If we're in webview, send message to React Native to open TPA settings
    if (isWebView && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'OPEN_APP_SETTINGS',
        packageName: packageName
      }));
    } else {
      // Fallback: navigate to app details page
      navigate(`/package/${packageName}`);
    }
  }, [isWebView, navigate]);

  const handleCardClick = useCallback((packageName: string) => {
    // Always navigate to app details page when clicking the card
    navigate(`/package/${packageName}`);
  }, [navigate]);

  const handleLogin = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  return (
      <div className="min-h-screen text-white" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="container mx-auto py-4 sm:py-8">
        {/* Heading + Search */}
        <div className="flex flex-col lg:flex-row mb-4 sm:mb-8 lg:items-center lg:justify-between gap-4 px-4 pb-4 sm:pb-8" style={{ borderBottom: '1px solid var(--border-color)' }}>
          {/* App Store heading */}
          <h1 className="text-4xl font-light hidden min-[850px]:block" style={{fontFamily:'"SF Pro Rounded", sans-serif', letterSpacing: '2.4px', color: 'var(--text-primary)'}}>Store</h1>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="flex-1 lg:max-w-md flex items-center space-x-3">
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
              </div>
              <input
                type="text"
                className="theme-search-input w-full pl-10 pr-4 py-2 rounded-3xl focus:outline-none focus:ring-2 focus:ring-[#47478E] border"
                style={{
                  backgroundColor: theme === 'light' ? 'var(--bg-secondary)' : '#141834',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)'
                }}
                placeholder="Search"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <button
                type="button"
                className="text-[15px] font-normal tracking-[0.1em]"
                style={{ color: 'var(--text-primary)' }}
                onClick={() => {
                  setSearchQuery('');
                  fetchApps();
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>

        {/* Organization filter indicator */}
        {activeOrgFilter && (
          <div className="my-2 sm:my-4 max-w-2xl mx-auto px-4">
            <div className="flex items-center text-sm bg-blue-50 text-blue-700 px-3 py-2 rounded-md">
              <Building className="h-4 w-4 mr-2" />
              <span>
                Filtered by: <span className="font-medium">{orgName || 'Organization'}</span>
              </span>
              <button
                onClick={clearOrgFilter}
                className="ml-auto text-blue-600 hover:text-blue-800"
                aria-label="Clear organization filter"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Search result indicator */}
        {searchQuery && (
          <div className="my-2 sm:my-4 max-w-2xl mx-auto px-4">
            <p className="text-gray-600">
              {filteredApps.length} {filteredApps.length === 1 ? 'result' : 'results'} for "{searchQuery}"
              {activeOrgFilter && ` in ${orgName}`}
            </p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center h-64 px-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Error message */}
        {error && !isLoading && (
          <div className="my-2 sm:my-4 max-w-2xl mx-auto mx-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p>{error}</p>
            <button
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
              onClick={fetchApps}
            >
              Try Again
            </button>
          </div>
        )}

        {/* App grid */}
        {!isLoading && !error && (
          <div className="mt-2 mb-2 sm:mt-8 sm:mb-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-2 sm:gap-y-12 px-0">
            {filteredApps.map(app => (
              <AppCard
                key={app.packageName}
                app={app}
                theme={theme}
                isAuthenticated={isAuthenticated}
                isWebView={isWebView}
                installingApp={installingApp}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onOpen={handleOpen}
                onCardClick={handleCardClick}
                onLogin={handleLogin}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredApps.length === 0 && (
          <div className="text-center py-12 px-4">
            {searchQuery ? (
              <>
                <p className="text-gray-500 text-lg">
                  No apps found for "{searchQuery}"
                  {activeOrgFilter && ` in ${orgName}`}
                </p>
                <button
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  onClick={() => {
                    setSearchQuery('');
                    fetchApps(); // Reset to all apps
                  }}
                >
                  Clear Search
                </button>
              </>
            ) : (
              <p className="text-gray-500 text-lg">
                {activeOrgFilter
                  ? `No apps available for ${orgName}.`
                  : "No apps available at this time."}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default AppStore;