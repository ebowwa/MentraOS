// components/TPATable.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { Edit, Trash, Key, Share, Plus } from "lucide-react";
import { AppResponse } from '../services/api.service';

// Import dialogs
import ApiKeyDialog from "./dialogs/ApiKeyDialog";
import SharingDialog from "./dialogs/SharingDialog";
import DeleteDialog from "./dialogs/DeleteDialog";

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
  const [searchQuery, setSearchQuery] = useState('');

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
          )}
        </div>

        {hasNoTpas && !isLoading && !error && !searchQuery && (
          <div className="p-6 text-center">
            <p className="text-gray-500 mb-4">Get started by creating your first Third-Party Application</p>
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