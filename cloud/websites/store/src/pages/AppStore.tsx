import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  useNavigate,
  useSearchParams,
  Link,
  useLocation,
} from "react-router-dom";
import { Search, X, Building, Lock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { usePlatform } from "../hooks/usePlatform";
import { useSearch } from "../contexts/SearchContext";
import { useIsMobile } from "../hooks/useMediaQuery";
import SearchBar from "../components/SearchBar";
import api, { AppFilterOptions } from "../api";
import { AppI } from "../types";
import Header from "../components/Header";
import AppCard from "../components/AppCard";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { formatCompatibilityError } from "../utils/errorHandling";

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
  const {
    isAuthenticated,
    supabaseToken,
    coreToken,
    isLoading: authLoading,
  } = useAuth();
  const { theme } = useTheme();
  const { isWebView } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();

  // Get organization ID from URL query parameter
  const orgId = searchParams.get("orgId");

  const { searchQuery, setSearchQuery } = useSearch();
  const isMobile = useIsMobile();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<AppI[]>([]);
  const [originalApps, setOriginalApps] = useState<AppI[]>([]);
  const [installingApp, setInstallingApp] = useState<string | null>(null);
  const [activeOrgFilter, setActiveOrgFilter] = useState<string | null>(orgId);
  const [orgName, setOrgName] = useState<string>("");

  // Helper function to check if authentication tokens are ready
  const isAuthTokenReady = () => {
    if (!isAuthenticated) return true; // Not authenticated, no token needed
    return !authLoading && (supabaseToken || coreToken); // Authenticated and has token
  };

  // Fetch apps on component mount or when org filter changes
  useEffect(() => {
    setActiveOrgFilter(orgId);

    // Only fetch apps if auth state is settled and tokens are ready
    if (isAuthTokenReady()) {
      fetchApps();
    }
  }, [isAuthenticated, supabaseToken, coreToken, authLoading, orgId]); // Re-fetch when authentication state, tokens, or org filter changes

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

        appList = await api.app.getAvailableApps(
          orgId ? filterOptions : undefined,
        );
        // console.log("Fetched available apps:", pkgapps);

        // If we're filtering by organization, get the organization name from the first app
        if (orgId && appList.length > 0) {
          const firstApp = appList[0];
          if (firstApp.orgName) {
            setOrgName(firstApp.orgName);
          } else {
            // Fallback to a generic name if orgName isn't available
            setOrgName("Selected Organization");
          }
        }
      } catch (err) {
        // console.error("Error fetching public apps:", err);
        setError("Failed to load apps. Please try again.");
        return;
      }

      // If authenticated, fetch installed apps and merge with available apps
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          installedApps = await api.app.getInstalledApps();

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>();
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true);
          });

          // Update the available apps with installed status
          appList = appList.map((app) => ({
            ...app,
            isInstalled: installedMap.has(app.packageName),
          }));

          console.log("Merged apps with install status:", appList);
        } catch (err) {
          console.error("Error fetching installed apps:", err);
          // Continue with available apps, but without install status
        }
      }

      setApps(appList);
      setOriginalApps(appList);
    } catch (err) {
      console.error("Error fetching apps:", err);
      setError("Failed to load apps. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter apps based on search query (client-side filtering now, adjust if needed for server-side)
  const filteredApps = useMemo(() => {
    if (searchQuery.trim() === "") return apps;

    const query = searchQuery.toLowerCase();
    const filtered = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query)) ||
        app.packageName.toLowerCase().includes(query), // Also match package name
    );
    
    // If we have a single app that was found by package search, show it regardless
    if (apps.length === 1 && apps !== originalApps) {
      return apps;
    }
    
    return filtered;
  }, [apps, originalApps, searchQuery]);

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
        orgId ? filterOptions : undefined,
      );

      // If authenticated and tokens are ready, update the search results with installed status
      if (isAuthenticated && isAuthTokenReady()) {
        try {
          // Get user's installed apps
          const installedApps = await api.app.getInstalledApps();

          // Create a map of installed apps for quick lookup
          const installedMap = new Map<string, boolean>();
          installedApps.forEach((app) => {
            installedMap.set(app.packageName, true);
          });

          // Update search results with installed status
          results.forEach((app) => {
            app.isInstalled = installedMap.has(app.packageName);
          });
        } catch (err) {
          console.error(
            "Error updating search results with install status:",
            err,
          );
        }
      }

      setApps(results);
    } catch (err) {
      console.error("Error searching apps:", err);
      toast.error("Failed to search apps");
      setError("Failed to search apps. Please try again."); // Set error state for UI
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Clears the organization filter
   */
  const clearOrgFilter = () => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);
      newParams.delete("orgId");
      return newParams;
    });
    setActiveOrgFilter(null);
    setOrgName("");
  };

  // Handle app installation
  const handleInstall = useCallback(
    async (packageName: string) => {
      if (!isAuthenticated) {
        navigate("/login");
        return;
      }

      // Use the web API
      try {
        setInstallingApp(packageName);

        const success = await api.app.installApp(packageName);

        if (success) {
          toast.success("App installed successfully");

          // Update the app in the list to show as installed
          setApps((prevApps) =>
            prevApps.map((app) =>
              app.packageName === packageName
                ? {
                    ...app,
                    isInstalled: true,
                    installedDate: new Date().toISOString(),
                  }
                : app,
            ),
          );
        } else {
          toast.error("Failed to install app");
        }
      } catch (err) {
        console.error("Error installing app:", err);

        // Try to get a more informative error message for compatibility issues
        const compatibilityError = formatCompatibilityError(err);
        if (compatibilityError) {
          toast.error(compatibilityError, {
            duration: 6000, // Show longer for detailed messages
          });
        } else {
          // Fallback to generic error message
          const errorMessage =
            (err as any)?.response?.data?.message || "Failed to install app";
          toast.error(errorMessage);
        }
      } finally {
        setInstallingApp(null);
      }
    },
    [isAuthenticated, navigate],
  );

  // Handle app uninstallation
  const handleUninstall = useCallback(
    async (packageName: string) => {
      if (!isAuthenticated) {
        navigate("/login");
        return;
      }

      try {
        console.log("Uninstalling app:", packageName);
        setInstallingApp(packageName);

        const success = await api.app.uninstallApp(packageName);

        if (success) {
          toast.success("App uninstalled successfully");

          // Update the app in the list to show as uninstalled
          setApps((prevApps) =>
            prevApps.map((app) =>
              app.packageName === packageName
                ? { ...app, isInstalled: false, installedDate: undefined }
                : app,
            ),
          );
        } else {
          toast.error("Failed to uninstall app");
        }
      } catch (err) {
        console.error("Error uninstalling app:", err);
        toast.error("Failed to uninstall app");
      } finally {
        setInstallingApp(null);
      }
    },
    [isAuthenticated, navigate],
  );

  const handleOpen = useCallback(
    (packageName: string) => {
      // If we're in webview, send message to React Native to open TPA settings
      if (isWebView && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            type: "OPEN_APP_SETTINGS",
            packageName: packageName,
          }),
        );
      } else {
        // Fallback: navigate to app details page
        navigate(`/package/${packageName}`);
      }
    },
    [isWebView, navigate],
  );

  const handleCardClick = useCallback(
    (packageName: string) => {
      // Always navigate to app details page when clicking the card
      navigate(`/package/${packageName}`);
    },
    [navigate],
  );

  const handleLogin = useCallback(() => {
    navigate("/login");
  }, [navigate]);

  const handleSearchChange = useCallback(async (value: string) => {
    setSearchQuery(value);
    // console.log("🔍 Search input:", value);
    
    // Restore original apps if we had searched by package before
    if (apps !== originalApps) {
      setApps(originalApps);
    }
    
    if (value.trim() === "") {
      // console.log("📊 Total apps available:", originalApps.length);
      return;
    }

    const query = value.toLowerCase();
    const filtered = originalApps.filter(
      (app) =>
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query)),
    );
    
    // console.log(`📊 Apps matching "${value}":`, filtered.length);
    
    // If no local matches, try searching by package name
    if (filtered.length === 0) {
      // console.log("🔎 No local matches found. Searching by package name...");
      setIsLoading(true);
      try {
        const pkgApp = await api.app.getAppByPackageName(value);

        if (pkgApp) {
          // console.log("✅ Found app by package name:", pkgApp.name, `(${pkgApp.packageName})`);
          // Check if user is authenticated to get install status
          if (isAuthenticated && isAuthTokenReady()) {
            try {
              const installedApps = await api.app.getInstalledApps();
              pkgApp.isInstalled = installedApps.some(app => app.packageName === pkgApp.packageName);
              console.log(`📱 App install status: ${pkgApp.isInstalled ? 'INSTALLED' : 'NOT INSTALLED'}`);
            } catch (error) {
              console.error("⚠️ Error checking install status:", error);
              pkgApp.isInstalled = false;
            }
          } else {
            pkgApp.isInstalled = false;
            // console.log("🔒 User not authenticated - showing as not installed");
          }
          
          setApps([pkgApp]);
          // Don't clear search query - let filteredApps handle it
        } else {
          // console.log("❌ No app found with package name:", value);
        }
      } catch (error) {
        // console.error("⚠️ Error searching by package name:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    
  }, [apps, originalApps, isAuthenticated, isAuthTokenReady]);


  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
      {/* Header */}
      <Header
        onSearch={handleSearch}
        onSearchClear={() => {
          setSearchQuery("");
          fetchApps();
        }}
      />

      {/* Main Content */}
      <main className="container mx-auto py-4 sm:py-8">
        {/* Search bar on mobile only */}
        {isMobile && (
          <div
            className="mb-4 sm:mb-8 px-4 pb-4 sm:pb-8"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <SearchBar
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              onSearchSubmit={handleSearch}
              onClear={() => {
                setSearchQuery("");
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
                Filtered by:{" "}
                <span className="font-medium">{orgName || "Organization"}</span>
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
              {filteredApps.length}{" "}
              {filteredApps.length === 1 ? "result" : "results"} for "
              {searchQuery}"{activeOrgFilter && ` in ${orgName}`}
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
            {filteredApps.map((app) => (
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
                    setSearchQuery("");
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