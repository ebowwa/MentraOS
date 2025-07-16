import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link, useLocation } from 'react-router-dom';
import { Search, X, Building, Lock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { usePlatform } from '../hooks/usePlatform';
import { useSearch } from '../contexts/SearchContext';
import { useIsMobile } from '../hooks/useMediaQuery';
import SearchBar from '../components/SearchBar';
import api, { AppFilterOptions } from '../api';
import { AppI } from '../types';
import Header from '../components/Header';
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

  const { searchQuery, setSearchQuery } = useSearch();
  const isMobile = useIsMobile();
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
  const filteredApps = searchQuery.trim() === ''
    ? apps
    : apps.filter(app =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.description && app.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

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
  const handleInstall = async (packageName: string) => {
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
  };

  // Handle app uninstallation
  const handleUninstall = async (packageName: string) => {
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
  };

  const handleOpen = (packageName: string) => {
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
  };

  const handleCardClick = (packageName: string) => {
    // Always navigate to app details page when clicking the card
    navigate(`/package/${packageName}`);
  };

  return (
      <div className="min-h-screen text-white" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <Header onSearch={handleSearch} onSearchClear={() => {
        setSearchQuery('');
        fetchApps();
      }} />

      {/* Main Content */}
      <main className="container mx-auto py-4 sm:py-8">
        {/* Search bar on mobile only */}
        {isMobile && (
          <div className="mb-4 sm:mb-8 px-4 pb-4 sm:pb-8" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <SearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={handleSearch}
              onClear={() => {
                setSearchQuery('');
                fetchApps();
              }}
              className="w-full"
            />
          </div>
        )}

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
            <p className="text-gray-600 text-left sm:text-center">
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
              <div key={app.packageName} className="p-4 sm:p-6 flex gap-3 transition-colors rounded-lg relative cursor-pointer" onClick={() => handleCardClick(app.packageName)} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <div className="absolute bottom-0 left-3 right-3 h-px" style={{ backgroundColor: 'var(--border-color)' }}></div>
                {/* Image Column */}
                <div className="shrink-0 flex items-start pt-2">
                  <img
                    src={app.logoURL}
                    alt={`${app.name} logo`}
                    className="w-12 h-12 object-cover rounded-full"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/48x48/gray/white?text=App';
                    }}
                  />
                </div>

                {/* Content Column */}
                <div className="flex-1 flex flex-col justify-center">
                  <div>
                    <h3 className="text-[15px] font-medium mb-1" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em', color: 'var(--text-primary)'}}>{app.name}</h3>
                    {app.description && (
                      <p className="text-[15px] font-normal leading-[1.3] line-clamp-3" style={{fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.04em', color: theme === 'light' ? '#4a4a4a' : '#9A9CAC', WebkitLineClamp: 3, height: '3.9em', display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden'}}>{app.description}</p>
                    )}
                  </div>
                </div>

                {/* Button Column */}
                <div className="shrink-0 flex items-center">
                  {isAuthenticated ? (
                    app.isInstalled ? (
                      isWebView ? (
                        // Show Open button only in webview for installed apps
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpen(app.packageName);
                          }}
                          disabled={installingApp === app.packageName}
                          className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit"
                          style={{
                            backgroundColor: 'var(--button-bg)',
                            color: 'var(--button-text)'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
                        >
                          <>Open</>
                        </Button>
                      ) : (
                        // Show greyed out Installed button for installed apps on desktop/mobile
                        <Button
                          disabled={true}
                          className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit opacity-30 cursor-not-allowed"
                          style={{
                            backgroundColor: 'var(--button-bg)',
                            color: 'var(--button-text)',
                            filter: 'grayscale(100%)'
                          }}
                        >
                          <>Installed</>
                        </Button>
                      )
                    ) : (
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInstall(app.packageName);
                        }}
                        disabled={installingApp === app.packageName}
                        className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit"
                        style={{
                          backgroundColor: 'var(--button-bg)',
                          color: 'var(--button-text)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
                      >
                        {installingApp === app.packageName ? (
                          <>
                            <div className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full mr-2" style={{ borderColor: 'var(--button-text)', borderTopColor: 'transparent' }}></div>
                            Installing
                          </>
                        ) : (
                          <>Get</>
                        )}
                      </Button>
                    )
                  ) : (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/login');
                      }}
                      className="text-[15px] font-normal tracking-[0.1em] px-4 py-[6px] rounded-full w-fit h-fit flex items-center gap-2"
                      style={{
                        backgroundColor: 'var(--button-bg)',
                        color: 'var(--button-text)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--button-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--button-bg)'}
                    >
                      <Lock className="h-4 w-4 mr-1" />
                      Sign in
                    </Button>
                  )}
                </div>
              </div>
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