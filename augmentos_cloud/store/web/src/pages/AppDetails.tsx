import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, X, ExternalLink, Calendar, Clock, Info, Star, Package } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../api';
import { AppI } from '../types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Header from '../components/Header';

const AppDetails: React.FC = () => {
  const { packageName } = useParams<{ packageName: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();

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

  // Fetch app details and install status
  const fetchAppDetails = async (pkgName: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Get app details
      const appDetails = await api.app.getAppByPackageName(pkgName);

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

    try {
      setInstallingApp(true);

      const success = await api.app.installApp(app.packageName, user?.email || '');

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

      const success = await api.app.uninstallApp(app.packageName, user?.email || '');

      if (success) {
        toast.success('App uninstalled successfully');
        setApp(prev => prev ? { ...prev, isInstalled: false, installedDate: undefined } : null);
      } else {
        toast.error('Failed to uninstall app');
      }
    } catch (err) {
      console.error('Error uninstalling app:', err);
      toast.error('Failed to uninstall app');
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Back button */}
        <button 
          onClick={() => navigate('/')}
          className="flex items-center text-blue-600 hover:text-blue-800 mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to App Store
        </button>

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        )}

        {/* Error message */}
        {error && !isLoading && (
          <div className="my-4 max-w-2xl mx-auto p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p>{error}</p>
            <button
              className="mt-2 text-sm font-medium text-red-700 hover:text-red-600"
              onClick={() => packageName && fetchAppDetails(packageName)}
            >
              Try Again
            </button>
          </div>
        )}

        {/* App details */}
        {!isLoading && !error && app && (
          <div className="max-w-4xl mx-auto">
            {/* Hero section */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
              <div className="p-6">
                <div className="flex flex-col md:flex-row items-start">
                  {/* App logo */}
                  <img
                    src={app.logoURL}
                    alt={`${app.name} logo`}
                    className="w-24 h-24 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://placehold.co/96x96/gray/white?text=App";
                    }}
                  />
                  
                  {/* App info */}
                  <div className="md:ml-6 mt-4 md:mt-0 flex-1">
                    <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
                    <p className="text-sm text-gray-500">{app.developerName || 'Mentra Labs'}</p>
                    
                    <div className="mt-4 flex flex-col gap-2">
                      {isAuthenticated ? (
                        app.isInstalled ? (
                          <Button
                            variant="outline"
                            onClick={handleUninstall}
                            disabled={installingApp}
                            className="w-full md:w-48"
                          >
                            {installingApp ? (
                              <div className="animate-spin h-4 w-4 border-2 border-gray-500 border-t-transparent rounded-full mr-2"></div>
                            ) : null}
                            Uninstall
                          </Button>
                        ) : (
                          <Button
                            onClick={handleInstall}
                            disabled={installingApp}
                            className="w-full md:w-48"
                          >
                            {installingApp ? (
                              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                            ) : (
                              <Download className="h-4 w-4 mr-1" />
                            )}
                            Install
                          </Button>
                        )
                      ) : (
                        <Button
                          onClick={() => navigate('/login')}
                          className="bg-blue-600 hover:bg-blue-700 w-full md:w-48"
                        >
                          Sign in to install
                        </Button>
                      )}
                      
                      {app.webviewURL && (
                        <Button variant="outline" asChild className="w-full md:w-48">
                          <a href={app.webviewURL} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open Website
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* App details sections */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left side: description */}
              <div className="md:col-span-2">
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="p-6">
                    <h2 className="text-xl font-semibold mb-4">About this app</h2>
                    <p className="text-gray-700 whitespace-pre-line">
                      {app.description || 'No description available.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right side: additional details */}
              <div>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="p-6">
                    <h2 className="text-xl font-semibold mb-4">App Details</h2>
                    
                    <div className="space-y-4">
                      <div className="flex items-start">
                        <Package className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Package Name</p>
                          <p className="text-sm text-gray-500">{app.packageName}</p>
                        </div>
                      </div>
                      
                      {app.version && (
                        <div className="flex items-start">
                          <Info className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Version</p>
                            <p className="text-sm text-gray-500">{app.version}</p>
                          </div>
                        </div>
                      )}

                      {app.tpaType && (
                        <div className="flex items-start">
                          <Star className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">App Type</p>
                            <p className="text-sm text-gray-500 capitalize">{app.tpaType}</p>
                          </div>
                        </div>
                      )}
                      
                      {app.isInstalled && app.installedDate && (
                        <div className="flex items-start">
                          <Calendar className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Installed Date</p>
                            <p className="text-sm text-gray-500">{formatDate(app.installedDate)}</p>
                          </div>
                        </div>
                      )}
                      
                      {app.createdAt && (
                        <div className="flex items-start">
                          <Clock className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Published Date</p>
                            <p className="text-sm text-gray-500">{formatDate(app.createdAt)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AppDetails;