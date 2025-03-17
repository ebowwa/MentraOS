// components/TPATable.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Edit, Trash, Key, Share2, Plus, Upload, KeyRound } from "lucide-react";
import { AppResponse } from '../services/api.service';
import { toast } from 'sonner';

// Import dialogs
import ApiKeyDialog from "./dialogs/ApiKeyDialog";
import SharingDialog from "./dialogs/SharingDialog";
import DeleteDialog from "./dialogs/DeleteDialog";
import PublishDialog from "./dialogs/PublishDialog";
import api from '../services/api.service';

interface TPATableProps {
  tpas: AppResponse[];
  isLoading: boolean;
  error: string | null;
  maxDisplayCount?: number;
  showViewAll?: boolean;
  showSearch?: boolean;
  onTpaDeleted?: (packageName: string) => void;
}

const TPATable: React.FC<TPATableProps> = ({
  tpas,
  isLoading,
  error,
  maxDisplayCount = Infinity,
  showViewAll = false,
  showSearch = true,
  onTpaDeleted
}) => {
  const navigate = useNavigate();
  
  // States for dialogs
  const [selectedTpa, setSelectedTpa] = useState<AppResponse | null>(null);
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [generatedApiKey, setGeneratedApiKey] = useState('');

  // Filter TPAs based on search query
  const filteredTpas = searchQuery
    ? tpas.filter(tpa =>
      tpa.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tpa.packageName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : tpas;

  // Limit the number of TPAs displayed
  const displayedTpas = filteredTpas.slice(0, maxDisplayCount);
  const hasNoTpas = tpas.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">Your Apps</CardTitle>
          <CardDescription>Manage your apps</CardDescription>
        </div>
        {(showSearch || showViewAll) && (
          <div className="flex items-center gap-4">
            {showSearch && (
              <div className="w-64">
                <Input
                  placeholder="Search your apps..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            {showViewAll && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/tpas">
                  View All
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin mx-auto h-8 w-8 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
              <p className="mt-2 text-gray-500">Loading Apps...</p>
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Package Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedTpas.length > 0 ? (
                  displayedTpas.map((tpa) => (
                    <TableRow key={tpa.packageName}>
                      <TableCell className="font-medium">{tpa.name}</TableCell>
                      <TableCell className="font-mono text-xs text-gray-500">{tpa.packageName}</TableCell>
                      <TableCell className="text-gray-500">
                        {new Date(tpa.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          tpa.appStoreStatus === 'PUBLISHED' ? 'bg-green-100 text-green-800' : 
                          tpa.appStoreStatus === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {tpa.appStoreStatus === 'DEVELOPMENT' ? 'Development' : 
                           tpa.appStoreStatus === 'SUBMITTED' ? 'Submitted' : 
                           tpa.appStoreStatus === 'PUBLISHED' ? 'Published' : 'Development'}
                        </span>
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
                            onClick={async () => {
                              setSelectedTpa(tpa);
                              setGeneratedApiKey('');
                              setIsApiKeyDialogOpen(true);
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTpa(tpa);
                              setIsShareDialogOpen(true);
                            }}
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTpa(tpa);
                              setIsPublishDialogOpen(true);
                            }}
                          >
                            <Upload className="h-4 w-4" />
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
                    <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                      {searchQuery ? 'No apps match your search criteria' : 'No apps to display'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {hasNoTpas && !isLoading && !error && !searchQuery && (
          <div className="p-6 text-center">
            <p className="text-gray-500 mb-4">Get started by creating your first app</p>
            <Button
              onClick={() => navigate('/tpas/create')}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create App
            </Button>
          </div>
        )}
      </CardContent>

      {/* Dialogs */}
      {selectedTpa && (
        <>
          <ApiKeyDialog
            tpa={selectedTpa}
            open={isApiKeyDialogOpen}
            onOpenChange={setIsApiKeyDialogOpen}
            apiKey={generatedApiKey}
          />

          <SharingDialog
            tpa={selectedTpa}
            open={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
          />

          <PublishDialog
            tpa={selectedTpa}
            open={isPublishDialogOpen}
            onOpenChange={setIsPublishDialogOpen}
            onPublishComplete={(updatedTpa) => {
              // Update the selected TPA with the new data
              setSelectedTpa(updatedTpa);
              
              // Update the TPA in the list to reflect the new status
              const updatedTpas = tpas.map(t => 
                t.packageName === updatedTpa.packageName ? {...t, appStoreStatus: updatedTpa.appStoreStatus} : t
              );
              
              // Force a re-render by triggering a parent component update
              if (onTpaDeleted) {
                // Using the same callback mechanism to notify parent to refresh data
                onTpaDeleted(updatedTpa.packageName);
              }
            }}
          />

          <DeleteDialog
            tpa={selectedTpa}
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirmDelete={(packageName) => {
              // Notify parent component of deletion
              if (onTpaDeleted) {
                onTpaDeleted(packageName);
              }
            }}
          />
        </>
      )}
    </Card>
  );
};

export default TPATable;