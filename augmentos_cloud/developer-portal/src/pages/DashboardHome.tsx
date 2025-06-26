// pages/DashboardHome.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, PlusIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import AppTable from "../components/AppTable";
import api from '../services/api.service';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '../context/OrganizationContext';
import { AppResponse } from '../services/api.service';

const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currentOrg, loading: orgLoading } = useOrganization();

  const [apps, setApps] = useState<AppResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  // Removed dialog states as they're now handled by the AppTable component

  // Fetch Apps when component mounts or organization changes
  useEffect(() => {
    const fetchApps = async () => {
      if (!isAuthenticated || !currentOrg) return;

      try {
        // Only show loading state if we haven't loaded apps before or during initial load
        if (!hasInitiallyLoaded) {
          setIsLoading(true);
        }

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
      fetchApps();
    }
  }, [isAuthenticated, authLoading, orgLoading, currentOrg]);

  const hasNoApps = apps.length === 0 && !isLoading && !error;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <Button
            className="gap-2"
            asChild
          >
            <Link to="/apps/create">
              <PlusIcon className="h-4 w-4" />
              Create App
            </Link>
          </Button>
        </div>

        {/* Documentation card - always shown */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-6">
          <Card className="col-span-1 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <CardDescription>Learn how to build apps for MentraOS</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600">
                Welcome to the MentraOS Developer Portal! Here, you can create and manage your apps for the MentraOS smart glasses platform.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border rounded-md p-4">
                  <h3 className="font-medium mb-2">Quick Start Guide</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Learn how to build your first MentraOS app in minutes.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://docs.mentra.glass" target="_blank" rel="noopener noreferrer">
                      View Guide
                    </a>
                  </Button>
                </div>
                <div className="border rounded-md p-4">
                  <h3 className="font-medium mb-2">API Documentation</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Explore the full MentraOS API reference.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://docs.mentra.glass" target="_blank" rel="noopener noreferrer">
                      View API Docs
                    </a>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Apps Section */}
        <AppTable
          apps={apps}
          isLoading={isLoading}
          error={error}
          maxDisplayCount={3}
          showSearch={true}
          showViewAll={true}
          onAppDeleted={(packageName) => {
            setApps(apps.filter(app => app.packageName !== packageName));
          }}
          onAppUpdated={(updatedApp) => {
            setApps(prevApps =>
              prevApps.map(app =>
                app.packageName === updatedApp.packageName ? updatedApp : app
              )
            );
          }}
        />
      </div>

      {/* Dialogs now handled by AppTable component */}
    </DashboardLayout>
  );
};

export default DashboardHome;