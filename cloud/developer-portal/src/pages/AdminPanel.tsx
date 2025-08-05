// pages/AdminPanel.tsx
import React, { useState, useEffect, use } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle,  } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search } from "@/components/ui/search";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle, Clock, Package, Smartphone, X } from 'lucide-react';
import api from '../services/api.service';
import {StatusBadge, UptimeStatus} from '@/components/ui/upTime';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select"
import { DatePicker } from '@/components/ui/date-picker';
import axios from 'axios';
import { AppDetailView } from './AppUptime';
interface AdminStat {
  counts: {
    development: number;
    submitted: number;
    published: number;
    rejected: number;
    admins: number;
  };
  recentSubmissions: any[];
}

// Admin user interface removed

interface AppDetail {
  _id: string;
  packageName: string;
  name: string;
  description: string;
  developerId?: string;  // Mark as optional as we're transitioning away from it
  organization?: {
    id: string;
    name: string;
    profile?: {
      contactEmail?: string;
      website?: string;
      description?: string;
    }
  };
  logoURL: string;
  appStoreStatus: string;
  createdAt: string;
  updatedAt: string;
  reviewNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  // Empty initial state - will be filled with real data from API
  const [stats, setStats] = useState<AdminStat>({
    counts: {
      development: 0,
      submitted: 0,
      published: 0,
      rejected: 0,
      admins: 0
    },
    recentSubmissions: []
  });
  const [submittedApps, setSubmittedApps] = useState<any[]>([]);
  const [submittedAppsStatus, setSubmittedAppsStatus] = useState<any[]>([]);

  /* Admin management removed */
  const [selectedApp, setSelectedApp] = useState<AppDetail | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const [openReviewDialog, setOpenReviewDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // Active tab state to replace the shadcn Tabs component
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chosenAppStatus, setChosenAppStatus] = useState("");



  // Get todays date: 
  const today = new Date();
  const monthNumber = today.getMonth(); // Months are 0-indexed in JavaScript
  const year = today.getFullYear();

  const [monthNumberDynamic, setMonthNumberDynamic] = useState(monthNumber);
  const [yearNumber, setYearNumber] = useState(year);
  // Admin panel component





  // Polling for app status updates
  useEffect(() => {
      // Fetch immediately
    fetchAppStatus();

  }, []);

  const fetchAppStatus = async () => {
      try {
        setStatusLoading(true);
        console.log('📡 Fetching app status from /status endpoint');
        const res = await axios.get('/api/app-uptime/status', {
          headers: { 'Content-Type': 'application/json' }
        });
        console.log('Status response:', res.data);
        
        if (res.data.apps) {
          setSubmittedAppsStatus(res.data.apps);
        }
        
        // Set the last update time
        setLastUpdateTime(new Date());
      } catch (error) {
        console.error('Error fetching app status:', error);
      } finally {
        setStatusLoading(false);
      }
    };


  // Load admin data when component mounts
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Wait for token to be ready
        await new Promise(resolve => setTimeout(resolve, 500));

        // Log the authentication state
        const token = localStorage.getItem('core_token');
        const email = localStorage.getItem('userEmail');
        console.log('Admin panel auth info:', {
          hasToken: !!token,
          tokenLength: token?.length,
          email: email
        });

        // Load the admin data
        await loadAdminData();
      } catch (err) {
        console.error('Error in admin data initialization:', err);
      }
    };

    fetchData();
  }, []);

  // Log when submittedApps state actually updates
  useEffect(() => {
    console.log('Updated apps with health status:', submittedApps);
  }, [submittedApps]);

  // Log when submittedAppsStatus state updates
  useEffect(() => {
    console.log('🔄 submittedAppsStatus state updated:', submittedAppsStatus);
  }, [submittedAppsStatus]);

  // Check if user is admin and load data
  const loadAdminData = async () => {
    setIsLoading(true);

    try {
      console.log('Loading admin data...');

      // Use the admin API service
      // Use a fallback to mock data if API requests fail
      let statsData = null;
      let appsData = [];

      try {
        // Stats request
        statsData = await api.admin.getStats();
        console.log('Stats data loaded:', statsData);
      } catch (err) {
        console.error('Error fetching stats:', err);
      }

      try {
        // Submitted apps request
        appsData = await api.admin.getSubmittedApps();
        console.log('Submitted apps loaded:', appsData.length);
      } catch (err) {
        console.error('Error fetching submitted apps:', err);
      }

      // Admin management removed

      // ONLY update state with real API data, do not use mock data anymore
      console.log('Updating state with API data:', {
        hasStats: !!statsData,
        submittedAppsCount: appsData?.length || 0
      });

      // Always update with real data, even if empty
      if (statsData) {
        console.log('Setting real stats data:', statsData);
        // Add health status to recent submissions if they exist
        if (statsData.recentSubmissions && statsData.recentSubmissions.length > 0) {
          const recentWithHealth = await addAppHealthStatus(statsData.recentSubmissions);
          setStats({
            ...statsData,
            recentSubmissions: recentWithHealth
          });
        } else {
          setStats(statsData);
        }
      } else {
        // If stats failed but we have app data, create a minimal stats object
        if (appsData) {
          const submittedCount = appsData.length;
          console.log('Creating minimal stats from app data, submitted count:', submittedCount);
          const recentWithHealth = await addAppHealthStatus(appsData.slice(0, 3));
          setStats({
            counts: {
              development: 0,
              submitted: submittedCount,
              published: 0,
              rejected: 0,
              admins: 0 // Admin count not needed
            },
            recentSubmissions: recentWithHealth
          });
        }
      }

      // Add health status and update state with real data
      console.log('Setting real submitted apps data, count:', appsData?.length || 0);
      setSubmittedApps(appsData || []);
      
      // Add health status and update state
      // const appsWithHealth = await addAppHealthStatus(appsData || []);
      // setSubmittedApps(appsWithHealth);

    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setIsLoading(false);
    }
    
  };

   // Get app status every 1 min: 
  async function addAppHealthStatus(submittedApps: any[]) {
    if (!submittedApps || submittedApps.length === 0) return submittedApps;

    const updatedApps = [...submittedApps];

    for (let i = 0; i < updatedApps.length; i++) {
      const cloudApp = updatedApps[i];
      const publicUrl = cloudApp.publicUrl;

      try {
        const res = await axios.get(`/api/app-uptime/ping?url=${encodeURIComponent(publicUrl + '/health')}`, {
          timeout: 10000
        });

        if (res.data.success && res.data.status === 200) {
          const healthData = res.data.data;
          
          if (healthData && healthData.status === "healthy") {
            console.log(`✅ ${healthData.app || cloudApp.name} is healthy`);
            updatedApps[i] = { ...cloudApp, appHealthStatus: "healthy" };
          } else {
            console.log(`❌ ${cloudApp.name} responded but not healthy`);
            updatedApps[i] = { ...cloudApp, appHealthStatus: "unhealthy" };
          }
        } else {
          console.warn(`Skipping ${publicUrl} - Not reachable`);
          updatedApps[i] = { ...cloudApp, appHealthStatus: "unreachable" };
        }

      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNABORTED') {
            console.warn(`Skipping ${publicUrl} - Request timeout`);
            updatedApps[i] = { ...cloudApp, appHealthStatus: "timeout" };
          } else {
            console.warn(`Skipping ${publicUrl} - Network error:`, error.message);
            updatedApps[i] = { ...cloudApp, appHealthStatus: "error" };
          }
        } else {
          console.warn(`Skipping ${publicUrl} - Unknown error:`, error);
          updatedApps[i] = { ...cloudApp, appHealthStatus: "error" };
        }
        continue;
      }
    }
    
    return updatedApps;
  }



  const openAppReview = async (packageName: string) => {
    try {
      const appData = await api.admin.getAppDetail(packageName);
      console.log('App details loaded:', appData);
      setSelectedApp(appData);
      setReviewNotes('');
      setOpenReviewDialog(true);
    } catch (error) {
      console.error('Error loading app details:', error);
      alert('Error loading app details. Please try again.');
    }
  };

  const handleApprove = async () => {
    if (!selectedApp) return;

    setActionLoading(true);
    try {
      await api.admin.approveApp(selectedApp.packageName, reviewNotes);

      // Refresh data
      loadAdminData();
      setOpenReviewDialog(false);
      alert('App approved successfully!');
    } catch (error) {
      console.error('Error approving app:', error);
      alert('Failed to approve app. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp || !reviewNotes.trim()) return;

    setActionLoading(true);
    try {
      await api.admin.rejectApp(selectedApp.packageName, reviewNotes);

      // Refresh data
      loadAdminData();
      setOpenReviewDialog(false);
      alert('App rejected. Developer has been notified.');
    } catch (error) {
      console.error('Error rejecting app:', error);
      alert('Failed to reject app. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  /* Admin management functions removed */


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Function to check API connectivity
  const checkApiConnection = async () => {
    try {
      const authToken = localStorage.getItem('core_token');
      console.log('Checking API with token:', { hasToken: !!authToken, tokenLength: authToken?.length });

      // Try the debug endpoint that doesn't require admin auth
      const data = await api.admin.debug();
      console.log('API debug response:', data);

      alert('API connection successful!\n\n' +
            `Status: ${data.status}\n` +
            `Time: ${data.time}\n` +
            `Total apps: ${data.counts?.apps?.total || 0}\n` +
            `Submitted apps: ${data.counts?.apps?.submitted || 0}\n` +
            `Admins: ${data.counts?.admins || 0}`);

      // If there are no admins, suggest creating one
      if (!data.counts?.admins || data.counts.admins === 0) {
        const createAdmin = confirm('No admin users found. Would you like to create a default admin user?');
        if (createAdmin) {
          // Try to create default admin
          const email = localStorage.getItem('userEmail') || prompt('Enter admin email:');
          if (email) {
            try {
              const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
              const createResponse = await fetch(`${apiUrl}/api/admin/bootstrap-admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, key: 'dev-mode' })
              });

              if (createResponse.ok) {
                alert(`Admin user ${email} created!`);
              } else {
                alert('Failed to create admin user');
              }
            } catch (err) {
              console.error('Error creating admin user:', err);
              alert('Failed to create admin user');
            }
          }
        }
      }
    } catch (error) {
      console.error('API debug check failed:', error);
      alert('Error connecting to API: ' + ((error as Error).message || 'Unknown error'));
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Admin Panel</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-10 w-10 animate-spin text-gray-500" />
          </div>
        ) : (
          <div>
            <div className="flex justify-between border-b mb-6">
              <div className="flex">
                <Button
                  variant={activeTab === "dashboard" ? "default" : "ghost"}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary mr-2"
                  onClick={() => {
                    setActiveTab("dashboard");
                    // setChosenAppStatus("idle");
                  }}
                >
                  Dashboard
                </Button>
                <Button
                  variant={activeTab === "apps" ? "default" : "ghost"}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary mr-2"
                  onClick={() => {
                    setActiveTab("apps");
                    // setChosenAppStatus("idle");
                  }}
                >
                  App Submissions
                </Button>
                <Button
                  variant={activeTab === "app_status" ? "default" : "ghost"}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary mr-2"
                  onClick={() => {
                    setActiveTab("app_status");
                    // setChosenAppStatus("idle");

                  }}
                >
                  App Status
                </Button>
              </div>
              <Button
                style={chosenAppStatus === "" ? { display: "none" } : { display: "inline-flex" }}
                variant={activeTab != "idle" ? "ghost" : "default"}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary flex items-center gap-2"
                onClick={() => {
                  setActiveTab("idle");
                }}
              >
                <Smartphone 
                  className={`h-4 w-4 ${activeTab === "idle" ? "text-white" : "text-black"}`} 
                />
                <span>{chosenAppStatus}</span>
                <X 
                  className={`h-4 w-4 ml-2 cursor-pointer ${activeTab === "idle" ? "text-white hover:bg-gray-600" : "text-black hover:bg-gray-200"} rounded p-0.5`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("X clicked - closing tab");
                    setChosenAppStatus("");
                    setActiveTab("app_status");
                  }}
                />
              </Button>
            </div>

            {activeTab === "dashboard" && stats && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mb-8">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">Pending Review</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center">
                        <Clock className="h-5 w-5 text-yellow-500 mr-2" />
                        <span className="text-2xl font-bold">{stats.counts.submitted}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">Published</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center">
                        <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                        <span className="text-2xl font-bold">{stats.counts.published}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">Rejected</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center">
                        <XCircle className="h-5 w-5 text-red-500 mr-2" />
                        <span className="text-2xl font-bold">{stats.counts.rejected}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-gray-500">Total Apps</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center">
                        <Package className="h-5 w-5 text-blue-500 mr-2" />
                        <span className="text-2xl font-bold">
                          {stats.counts.development + stats.counts.submitted + stats.counts.published + stats.counts.rejected}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {stats.recentSubmissions.map((app) => (
                      <div key={app._id} className="py-4 flex justify-between items-center">
                        <div>
                          <div className="font-medium">{app.name}</div>
                          <div className="text-sm text-gray-500">{app.packageName}</div>
                          <div className="text-xs text-gray-400">Submitted: {formatDate(app.updatedAt)}</div>
                          <div className="text-xs">
                            Status: {submittedAppsStatus.find(statusApp => statusApp.packageName === app.packageName)?.healthStatus || 'unknown'}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <StatusBadge status={submittedAppsStatus.find(statusApp => statusApp.packageName === app.packageName)?.healthStatus || "unknown"} />
                          <Button size="sm" onClick={() => openAppReview(app.packageName)}>
                            Review
                          </Button>
                        </div>
                      </div>
                    ))}

                    {stats.recentSubmissions.length === 0 && (
                      <div className="py-6 text-center text-gray-500">
                        No pending submissions
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              </>
            )}

            {activeTab === "apps" && (
              <Card>
                <CardHeader>
                  <CardTitle>App Submissions</CardTitle>
                </CardHeader>
                <CardContent>
                  {submittedApps.length === 0 ? (
                    <div className="py-6 text-center text-gray-500">
                      No pending submissions
                    </div>
                  ) : (
                    <div className="divide-y">
                      {submittedApps.map((app) => (
                        <div key={app._id} className="py-4 flex justify-between items-center">
                          <div className="flex items-center">
                            <img
                              src={app.logoURL || 'https://placehold.co/100x100?text=App'}
                              alt={app.name}
                              className="w-10 h-10 rounded-md mr-3"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=App';
                              }}
                            />
                            <div>
                              <div className="font-medium">{app.name}</div>
                              <div className="text-sm text-gray-500">{app.packageName}</div>
                              <div className="text-xs text-gray-400">Submitted: {formatDate(app.updatedAt)}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <StatusBadge status={submittedAppsStatus.find(statusApp => statusApp.packageName === app.packageName)?.healthStatus || app.appHealthStatus || "unknown"} />
                            <Button size="sm" onClick={() => openAppReview(app.packageName)}>
                              Review
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "app_status" && (
              <div className='space-y-4'>
                <div className="flex flex-row gap-[10px]">
                  <Search inputHint="Search app" />
                  <Select onValueChange={(value) => console.log(value)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="developer">Developer</SelectItem>
                    </SelectContent>
                  </Select>
                  <DatePicker initialYear={year} initialMonth={monthNumber} setMonthNumberDynamic={setMonthNumberDynamic} setYearNumber={setYearNumber} />
                </div>
                
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <div style={{flex: 1, display: "flex", flexDirection: "row", alignItems: "center", gap: "10px"}}>
                          <div style={{flex: 1}}>
                            App Status
                          </div>
                          <span className="text-sm font-medium text-gray-500"></span>
                          <div style={{display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center"}}>
                            <div className="text-xs text-gray-600">
                              {lastUpdateTime ? lastUpdateTime.toLocaleTimeString() : 'Never'}
                            </div>
                          </div>
                          <Button 
                            style={{width: "100px"}} 
                            onClick={() => {
                              fetchAppStatus();
                            }}
                            disabled={statusLoading}
                          >
                            {statusLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Clock className="h-4 w-4" />
                                <div>Update</div>

                              </>

                            )}
                          </Button>

                        </div>
                      
                      
                    </CardTitle>
                    
                  </CardHeader>
                  <CardContent>
                    {submittedApps.length === 0 ? (
                      <div className="py-6 text-center text-gray-500">
                        No pending submissions
                      </div>
                    ) : (
                      <div className="divide-y">
                        {submittedApps.map((app) => (
                          <div key={app._id} className="py-4 flex justify-between items-center" onClick={() => {
                            setChosenAppStatus(app.name);
                            setActiveTab("idle");

                          }}>
                            <div className="flex items-center">
                              <img
                                src={app.logoURL || 'https://placehold.co/100x100?text=App'}
                                alt={app.name}
                                className="w-10 h-10 rounded-md mr-3"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=App';
                                }}
                            />
                              <div>
                                <div className="font-medium">{app.name}</div>
                                <div className="text-sm text-gray-500">{app.packageName}</div>
                                <div className="text-xs text-gray-400">Submitted: {formatDate(app.updatedAt)}</div>
                              </div>
                            </div>
                            <UptimeStatus title="Chat" uptimePercentage={100} month={monthNumberDynamic} year={yearNumber} appHealthStatus={submittedAppsStatus.find(statusApp => statusApp.packageName === app.packageName)?.healthStatus || app.appHealthStatus || "unknown"} />

                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              
            )}
            {chosenAppStatus !== "" && (() => {
              // Find the selected app from submittedApps
              const selectedApp = submittedApps.find(app => app.name === chosenAppStatus);
              
              if (!selectedApp) {
                return (
                  <Card>
                    <CardContent className="p-6 text-center text-gray-500">
                      App not found: {chosenAppStatus}
                    </CardContent>
                  </Card>
                );
              }
              
              // Get real-time health status from submittedAppsStatus array
              const statusApp = submittedAppsStatus.find(statusApp => 
                statusApp.packageName === selectedApp.packageName
              );
              
              const healthStatus = statusApp?.healthStatus || selectedApp.appHealthStatus || "unknown";
              console.log(`Selected app health status: ${healthStatus}`);
              // Map health status to Online/Offline
              const getOnlineStatus = (health: string): 'Online' | 'Offline' => {
                switch (health.toLowerCase()) {
                  case 'healthy':
                  case 'operational':
                  case 'up':
                    return 'Online';
                  case 'unhealthy':
                  case 'down':
                  case 'error':
                  case 'timeout':
                  case 'unreachable':
                    return 'Offline';
                  default:
                    return 'Offline'; // Default to offline for unknown status
                }
              };
              
              const isOnline = getOnlineStatus(healthStatus);
              const uptimePercentage = isOnline === 'Online' ? 99.984 : 
                (healthStatus === 'timeout' ? 85.5 : 
                 healthStatus === 'unreachable' ? 75.2 : 95.123);
              
              // Create uptime history based on current status
              const uptimeHistory = Array(90).fill('up').map((_, i) => {
                if (isOnline === 'Offline') {
                  // Show recent downtime for offline apps
                  if (i > 87) return 'down';
                  return Math.random() > 0.05 ? 'up' : 'down';
                } else {
                  // Show mostly up with occasional small downtimes
                  return Math.random() > 0.01 ? 'up' : 'down';
                }
              });
              
              // Transform the app data to match AppStatus interface
              const appStatusData = {
                id: selectedApp._id || selectedApp.packageName,
                name: selectedApp.name,
                logo: selectedApp.logoURL || 'https://placehold.co/48x48/374151/ffffff?text=APP',
                packageName: selectedApp.packageName,
                submitted: formatDate(selectedApp.createdAt || selectedApp.updatedAt),
                uptimePercentage,
                status: healthStatus,
                uptimeHistory,
                details: {
                  last24h: isOnline === 'Online' ? 100 : (healthStatus === 'timeout' ? 85.5 : 98.5),
                  last7d: isOnline === 'Online' ? 99.952 : (healthStatus === 'timeout' ? 85.234 : 97.234),
                  last30d: isOnline === 'Online' ? 99.984 : (healthStatus === 'timeout' ? 85.789 : 96.789),
                  last90d: uptimePercentage,
                  events: isOnline === 'Offline' ? [
                    {
                      date: new Date().toLocaleDateString(),
                      duration: healthStatus === 'timeout' ? 25 : 15,
                      reason: healthStatus === 'timeout' ? 'Connection Timeout' : 
                              healthStatus === 'unreachable' ? 'Service Unreachable' :
                              'Health Check Failed',
                      details: `App ${selectedApp.name} ${
                        healthStatus === 'timeout' ? 'timed out during health check' :
                        healthStatus === 'unreachable' ? 'is not reachable at the configured endpoint' :
                        `failed health check with status: ${healthStatus}`
                      }`
                    }
                  ] : []
                }
              };
              
              return <AppDetailView 
                app={appStatusData} 
                onRefresh={fetchAppStatus}
                isRefreshing={statusLoading}
              />;
            })()}

            {/* Admin management tab removed */}
          </div>
        )}

        {/* App Review Dialog */}
        <Dialog open={openReviewDialog} onOpenChange={setOpenReviewDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review App Submission</DialogTitle>
              <DialogDescription>
                Review the app details before approving or rejecting.
              </DialogDescription>
            </DialogHeader>

            {selectedApp && (
              <div className="space-y-4 py-2">
                <div className="flex items-center space-x-4">
                  <img
                    src={selectedApp.logoURL || 'https://placehold.co/100x100?text=App'}
                    alt={selectedApp.name}
                    className="w-16 h-16 rounded-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://placehold.co/100x100?text=App';
                    }}
                  />
                  <div>
                    <h3 className="font-medium text-lg">{selectedApp.name}</h3>
                    <p className="text-sm text-gray-500">{selectedApp.packageName}</p>
                  </div>
                </div>

                <hr className="border-t border-gray-200" />

                <div>
                  <h4 className="font-medium mb-1">Description</h4>
                  <p className="text-sm">{selectedApp.description || 'No description provided'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-1">Developer</h4>
                    <p className="text-sm">
                      {selectedApp.organization ?
                        selectedApp.organization.name :
                        selectedApp.developerId || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <h4 className="font-medium mb-1">Submitted</h4>
                    <p className="text-sm">{formatDate(selectedApp.updatedAt)}</p>
                  </div>
                </div>

                <hr className="border-t border-gray-200" />

                <div>
                  <h4 className="font-medium mb-1">Review Notes</h4>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add review notes here (required for rejection)"
                    className="mt-2"
                    rows={4}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="space-x-3">
              <Button
                variant="outline"
                onClick={() => setOpenReviewDialog(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading || !reviewNotes.trim()}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin management dialog removed */}
      </div>
    </DashboardLayout>
  );
};

export default AdminPanel;