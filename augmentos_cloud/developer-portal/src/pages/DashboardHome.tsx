// pages/DashboardHome.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Plus, PlusIcon, Edit, Trash, Key, Share } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import api from '../services/api.service';
import { useAuth } from '../hooks/useAuth';
import { AppResponse } from '../services/api.service';

// Import dialogs
import ApiKeyDialog from "../components/dialogs/ApiKeyDialog";
import SharingDialog from "../components/dialogs/SharingDialog";
import DeleteDialog from "../components/dialogs/DeleteDialog";

const DashboardHome: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [tpas, setTpas] = useState<AppResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // States for dialogs
  const [selectedTpa, setSelectedTpa] = useState<AppResponse | null>(null);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch TPAs when component mounts
  useEffect(() => {
    const fetchTPAs = async () => {
      if (!isAuthenticated) return;
      
      try {
        setIsLoading(true);
        const tpaData = await api.apps.getAll();
        setTpas(tpaData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch TPAs:', err);
        setError('Failed to load TPAs. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (!authLoading) {
      fetchTPAs();
    }
  }, [isAuthenticated, authLoading]);

  // Filter TPAs based on search query
  const filteredTpas = searchQuery
    ? tpas.filter(tpa =>
      tpa.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpa.packageName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : tpas;

  const hasNoTpas = tpas.length === 0 && !isLoading && !error;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <Button
            className="gap-2"
            asChild
          >
            <Link to="/tpas/create">
              <PlusIcon className="h-4 w-4" />
              Create App
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">
            <p>{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        ) : hasNoTpas ? (
          // Empty state
          <Card className="bg-white shadow-sm border border-gray-200">
            <CardContent className="pt-6">
              <div className="text-center py-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Apps created yet</h3>
                <p className="mt-1 text-sm text-gray-500">Get started by creating your first Third-Party Application (TPA).</p>
                <div className="mt-6">
                  <Button
                    className="gap-2"
                    onClick={() => navigate('/tpas/create')}
                  >
                    <Plus className="h-4 w-4" />
                    Create App
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          // Dashboard with TPAs
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Documentation card */}
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Getting Started</CardTitle>
                <CardDescription>Learn how to build apps for AugmentOS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  Welcome to the AugmentOS Developer Portal! Here, you can create and manage your Third-Party Applications (TPAs) for the AugmentOS smart glasses platform.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-2">Quick Start Guide</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Learn how to build your first TPA in minutes.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://www.npmjs.com/package/@augmentos/sdk" target="_blank" rel="noopener noreferrer">
                        View Guide
                      </a>
                    </Button>
                  </div>
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-2">API Documentation</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Explore the full AugmentOS API reference.
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://www.npmjs.com/package/@augmentos/sdk" target="_blank" rel="noopener noreferrer">
                        View API Docs
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* TPAs list card */}
            <Card className="col-span-1 lg:col-span-3">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Your Apps</CardTitle>
                  <CardDescription>Manage your apps</CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-64">
                    <Input
                      placeholder="Search your apps..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/tpas">
                      View All
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Package Name</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTpas.length > 0 ? (
                        filteredTpas.slice(0, 3).map((tpa) => (
                          <TableRow key={tpa.packageName}>
                            <TableCell className="font-medium">{tpa.name}</TableCell>
                            <TableCell className="font-mono text-xs text-gray-500">{tpa.packageName}</TableCell>
                            <TableCell className="text-gray-500">
                              {new Date(tpa.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => navigate(`/tpas/${tpa.packageName}/edit`)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTpa(tpa);
                                    setIsApiKeyDialogOpen(true);
                                  }}
                                >
                                  <Key className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTpa(tpa);
                                    setIsShareDialogOpen(true);
                                  }}
                                >
                                  <Share className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600"
                                  onClick={() => {
                                    setSelectedTpa(tpa);
                                    setIsDeleteDialogOpen(true);
                                  }}
                                >
                                  <Trash className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                            {searchQuery ? 'No TPAs match your search criteria' : 'No TPAs to display'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {selectedTpa && (
        <>
          <ApiKeyDialog
            tpa={selectedTpa}
            open={isApiKeyDialogOpen}
            onOpenChange={setIsApiKeyDialogOpen}
            apiKey={"********-****-****-****-************"}
          />

          <SharingDialog
            tpa={selectedTpa}
            open={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
          />

          <DeleteDialog
            tpa={selectedTpa}
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirmDelete={(packageName) => {
              // Update local state when TPA is deleted
              setTpas(tpas.filter(tpa => tpa.packageName !== packageName));
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default DashboardHome;