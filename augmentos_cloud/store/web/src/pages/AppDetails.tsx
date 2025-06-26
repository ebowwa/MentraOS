import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Download, X, ExternalLink, Calendar, Clock, Info, Star, Package, Building, Globe, Mail, FileText } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useIsDesktop } from '../hooks/useMediaQuery';
import api from '../api';
import { AppI } from '../types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Header from '../components/Header';
import AppPermissions from '../components/AppPermissions';

const AppDetails: React.FC = () => {
  const { packageName } = useParams<{ packageName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const isDesktop = useIsDesktop();

  const [app, setApp] = useState<AppI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installingApp, setInstallingApp] = useState<boolean>(false);

  // Fetch app details on component mount
  useEffect(() => {
    if (packageName) {
      fetchAppDetails(packageName);
    }
  }, [packageName, isAuthenticated]);

  /**
   * Navigates to the app store filtered by the given organization ID
   * @param orgId Organization ID to filter by
   */
  const navigateToOrgApps = (orgId: string) => {
    navigate(`/?orgId=${orgId}`);
  };

  // Fetch app details and install status
  const fetchAppDetails = async (pkgName: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Get app details
      const appDetails = await api.app.getAppByPackageName(pkgName);
      console.log('Raw app details from API:', appDetails);

      if (!appDetails) {
        setError('App not found');
        return;
      }

      // If authenticated, check if app is installed
      if (isAuthenticated) {
        try {
          // Get user's installed apps
          const installedApps = await api.app.getInstalledApps();

          // Check if this app is installed
          const isInstalled = installedApps.some(app => app.packageName === pkgName);

          // Update app with installed status
          appDetails.isInstalled = isInstalled;

          if (isInstalled) {
            // Find installed date from the installed apps
            const installedApp = installedApps.find(app => app.packageName === pkgName);
            if (installedApp && installedApp.installedDate) {
              appDetails.installedDate = installedApp.installedDate;
            }
          }
        } catch (err) {
          console.error('Error checking install status:', err);
          // Continue with app details, but without install status
        }
      }

      setApp(appDetails);
    } catch (err) {
      console.error('Error fetching app details:', err);
      setError('Failed to load app details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle app installation
  const handleInstall = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (!app) return;

    // Use the web API
    try {
      setInstallingApp(true);

      const success = await api.app.installApp(app.packageName);

      if (success) {
        toast.success('App installed successfully');
        setApp(prev => prev ? { ...prev, isInstalled: true, installedDate: new Date().toISOString() } : null);
      } else {
        toast.error('Failed to install app');
      }
    } catch (err) {
      console.error('Error installing app:', err);
      toast.error('Failed to install app');
    } finally {
      setInstallingApp(false);
    }
  };

  // Handle app uninstallation
  const handleUninstall = async () => {
    if (!isAuthenticated || !app) return;

    try {
      setInstallingApp(true);

      // First stop the app
      // const stopSuccess = await api.app.stopApp(app.packageName);
      // if (!stopSuccess) {
      //   toast.error('Failed to stop app before uninstallation');
      //   return;
      // }
      // App should be stopped automatically by the backend when uninstalling.

      // Then uninstall the app
      console.log('Uninstalling app:', app.packageName);
      const uninstallSuccess = await api.app.uninstallApp(app.packageName);

      if (uninstallSuccess) {
        toast.success('App uninstalled successfully');
        setApp(prev => prev ? { ...prev, isInstalled: false, installedDate: undefined } : null);
      } else {
        toast.error('Failed to uninstall app');
      }
    } catch (err) {
      console.error('Error uninstalling app:', err);
      toast.error('Failed to uninstall app. Please try again.');
    } finally {
      setInstallingApp(false);
    }
  };

  // Formatted date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <>
      {/* Show header on mobile screens */}
      <div className="sm:hidden">
        <Header />
      </div>
      
      <div 
        className="min-h-screen sm:flex sm:items-center sm:justify-center sm:p-4"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {/* Error state */}
        {!isLoading && error && (
          <div className="text-red-500 p-4">{error}</div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Main content */}
        {!isLoading && !error && app && (
          <div
            className="w-full sm:max-w-[90vw] sm:w-[720px] sm:max-w-[720px] min-h-screen sm:min-h-0 sm:max-h-[90vh] overflow-y-auto sm:rounded-[24px] custom-scrollbar relative"
            style={{
              // Mobile styles (default)
              backgroundColor: 'var(--bg-primary)',
              // Desktop styles applied based on media query hook
              ...(isDesktop ? {
                background: theme === 'light' ? 'transparent' : 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
                boxShadow: theme === 'light' ? 'none' : 'inset 0 0 0 1px rgba(255, 255, 255, 0.1), inset 0 0 32px rgba(0, 0, 0, 0.25)',
                border: theme === 'light' ? '2px solid #e5e5e5' : 'none',
              } : {})
            }}
          >
          {/* Desktop Close Button */}
          <button
            onClick={() => navigate(-1)}
            className="hidden sm:block absolute top-6 right-6 transition-colors"
            style={{ 
              color: theme === 'light' ? '#000000' : '#9CA3AF'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = theme === 'light' ? '#333333' : '#ffffff'}
            onMouseLeave={(e) => e.currentTarget.style.color = theme === 'light' ? '#000000' : '#9CA3AF'}
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Mobile Back Button */}
          <div className="sm:hidden px-6 py-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 transition-colors"
              style={{ color: 'var(--text-primary)' }}
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-[16px]">Back</span>
            </button>
          </div>

          {/* Content wrapper with responsive padding */}
          <div className="px-6 py-6 pb-safe sm:p-0">
            <div className="max-w-2xl mx-auto sm:max-w-none sm:p-12 pb-8 sm:pb-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 max-[840px]:flex-col max-[840px]:gap-6">
              <div className="flex items-center gap-4 max-[840px]:flex-col max-[840px]:items-center max-[840px]:gap-4">
              <img
                src={app.logoURL}
                alt={`${app.name} logo`}
                className="w-16 h-16 object-cover rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://placehold.co/64x64/gray/white?text=App';
                }}
              />
              <h2
                id="app-modal-title"
                className="text-[32px] font-medium leading-[1.2] max-[840px]:text-center"
                style={{
                  fontFamily: '"SF Pro Rounded", sans-serif',
                  letterSpacing: '0.02em',
                  color: 'var(--text-primary)'
                }}
              >
                {app.name}
              </h2>
            </div>

            <div className="flex items-center gap-4 max-[840px]:w-full max-[840px]:justify-center">
              {isAuthenticated ? (
                app.isInstalled ? (
                  <Button
                    onClick={handleUninstall}
                    disabled={installingApp}
                    className="w-full sm:w-[140px] h-[40px] bg-[#E24A24] hover:bg-[#E24A24]/90 text-[#E2E4FF] text-[16px] font-normal rounded-full"
                    style={{ fontFamily: '"SF Pro Rounded", sans-serif' }}
                  >
                    Uninstall
                  </Button>
                ) : (
                  <Button
                    onClick={handleInstall}
                    disabled={installingApp}
                    className="w-full sm:w-[140px] h-[40px] bg-[#242454] hover:bg-[#2d2f5a] text-[#E2E4FF] text-[16px] font-normal rounded-full"
                    style={{ fontFamily: '"SF Pro Rounded", sans-serif' }}
                  >
                    {installingApp ? 'Installing…' : 'Get App'}
                  </Button>
                )
              ) : (
                <Button
                  onClick={() => navigate('/login', { state: { returnTo: location.pathname } })}
                  className="w-full sm:w-[140px] h-[40px] bg-[#242454] text-[#E2E4FF] text-[16px] font-normal rounded-full"
                  style={{ fontFamily: '"SF Pro Rounded", sans-serif' }}
                >
                  Sign in
                </Button>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="mb-12">
            <p
              className="text-[16px] font-normal leading-[1.6] sm:max-w-[480px]"
              style={{ fontFamily: '"SF Pro Rounded", sans-serif', color: theme === 'light' ? '#000000' : '#E4E4E7' }}
            >
              {app.description || 'No description available.'}
            </p>
          </div>

          {/* Information Section */}
          <div className="mb-12">
            <h3
              className="text-[12px] font-semibold uppercase mb-6"
              style={{
                fontFamily: '"SF Pro Rounded", sans-serif',
                letterSpacing: '0.05em',
                color: theme === 'light' ? '#000000' : '#9CA3AF'
              }}
            >
              Information
            </h3>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[14px] font-medium" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>Company</span>
                <span className="text-[14px] font-normal text-right" style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}>
                  {app.orgName || app.developerProfile?.company || 'Mentra'}
                </span>
              </div>

              {app.developerProfile?.website && (
                <div className="flex justify-between items-center">
                  <span className="text-[14px] font-medium" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>Website</span>
                  <a
                    href={app.developerProfile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] font-normal hover:underline text-right"
                    style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}
                  >
                    {app.developerProfile.website}
                  </a>
                </div>
              )}

              {app.developerProfile?.contactEmail && (
                <div className="flex justify-between items-center">
                  <span className="text-[14px] font-medium" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>Contact</span>
                  <a
                    href={`mailto:${app.developerProfile.contactEmail}`}
                    className="text-[14px] font-normal hover:underline text-right"
                    style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}
                  >
                    {app.developerProfile.contactEmail}
                  </a>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-[14px] font-medium" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>App Type</span>
                <span className="text-[14px] font-normal text-right capitalize" style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}>
                  {app.tpaType || 'Standard'}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[14px] font-medium" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>Package</span>
                <span className="text-[14px] font-normal text-right" style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}>
                  {app.packageName}
                </span>
              </div>
            </div>
          </div>

          {/* Required Permissions */}
          <div>
            <h3
              className="text-[12px] font-semibold uppercase mb-6"
              style={{ fontFamily: '"SF Pro Rounded", sans-serif', letterSpacing: '0.05em', color: theme === 'light' ? '#000000' : '#9CA3AF' }}
            >
              Required Permissions
            </h3>
            <div className="space-y-3">
              {app.permissions && app.permissions.length > 0 ? (
                app.permissions.map((permission, index) => (
                  <div
                    key={index}
                    className="text-[14px] font-normal leading-[1.5]"
                    style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}
                  >
                    <strong style={{ color: theme === 'light' ? '#000000' : '#E4E4E7' }}>
                      {permission.type || 'Microphone'}
                    </strong>{' '}
                    {permission.description || 'For voice import and audio processing.'}
                  </div>
                ))
              ) : (
                <div className="text-[14px] font-normal" style={{ color: theme === 'light' ? '#000000' : '#9CA3AF' }}>None</div>
              )}
            </div>
          </div>
          </div>
          </div>
          </div>
        )}
      </div>
    </>
  );
};

export default AppDetails;