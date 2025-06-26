// pages/AppList.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useNavigate } from 'react-router-dom';
import { Plus } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import AppTable from "../components/AppTable";
import api, { AppResponse } from '../services/api.service';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../context/OrganizationContext';

const AppList: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, tokenReady } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrganization();

  // State for App data
  const [apps, setApps] = useState<AppResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);

  // Fetch Apps from API
  useEffect(() => {
    // Debounce timer to prevent rapid re-fetches
    let timeoutId: NodeJS.Timeout;

    const fetchApps = async () => {
      if (!isAuthenticated) return;
      if (!tokenReady) {
        console.log('Token not ready yet, waiting before fetching Apps...');
        return;
      }
      if (!currentOrg) {
        console.log('No organization selected, waiting...');
        return;
      }

      // Only show loading state if we haven't loaded apps before or during initial load
      if (!hasInitiallyLoaded) {
        setIsLoading(true);
      }

      try {
        console.log('Fetching Apps for organization:', currentOrg.name);
        const appData = await api.apps.getAll(currentOrg.id);
        setApps(appData);
        setError(null);
        setHasInitiallyLoaded(true);
      } catch (err) {
        console.error('Failed to fetch Apps:', err);
        setError('Failed to load Apps. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading && !orgLoading) {
      // Debounce the fetch to prevent rapid re-fetches on focus changes
      timeoutId = setTimeout(fetchApps, 100);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isAuthenticated, authLoading, tokenReady, currentOrg?.id, orgLoading]);

  // Handle App deletion
  const handleAppDeleted = (packageName: string) => {
    setApps(apps.filter(app => app.packageName !== packageName));
  };

  // Handle App update
  const handleAppUpdated = (updatedApp: AppResponse) => {
    setApps(prevApps =>
      prevApps.map(app =>
        app.packageName === updatedApp.packageName ? updatedApp : app
      )
    );
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">My Apps</h1>
          <Button
            className="gap-2"
            onClick={() => navigate('/apps/create')}
          >
            <Plus className="h-4 w-4" />
            Create App
          </Button>
        </div>

        <AppTable
          apps={apps}
          isLoading={isLoading}
          error={error}
          showSearch={true}
          showViewAll={false}
          onAppDeleted={handleAppDeleted}
          onAppUpdated={handleAppUpdated}
        />
      </div>
    </DashboardLayout>
  );
};

export default AppList;