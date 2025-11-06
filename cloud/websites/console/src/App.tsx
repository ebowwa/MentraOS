// App.tsx
import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Components
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

// Lazy load pages for better performance
const LandingPage = lazy(() => import("./pages/LandingPage"));
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const LoginOrSignup = lazy(() => import("./pages/AuthPage"));
const AppList = lazy(() => import("./pages/AppList"));
const CreateApp = lazy(() => import("./pages/CreateApp"));
const EditApp = lazy(() => import("./pages/EditApp"));
const OrganizationSettings = lazy(() => import("./pages/OrganizationSettings"));
const Members = lazy(() => import("./pages/Members"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));

import { AuthProvider, useAuth, ForgotPasswordPage, ResetPasswordPage } from "@mentra/shared";
import { OrganizationProvider } from "./context/OrganizationContext";
import { useAccountStore } from "./stores/account.store";
import { useOrgStore } from "./stores/orgs.store";
import { useAppStore } from "./stores/apps.store";

// Loading component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
  </div>
);

// Protected route component
function ProtectedRoute({
  children,
  // requireAdmin = false,
}: {
  children: React.ReactNode;
  requireAdmin?: boolean;
}) {
  const { isAuthenticated, isLoading, user, session } = useAuth();
  // const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  // const [isCheckingAdmin, setIsCheckingAdmin] = React.useState(false);

  // Check admin status if required
  // React.useEffect(() => {
  //   async function checkAdminStatus() {
  //     if (requireAdmin && isAuthenticated && !isLoading) {
  //       setIsCheckingAdmin(true);
  //       try {
  //         const api = (await import("./services/api.service")).default;
  //         const result = await api.admin.checkAdmin();
  //         setIsAdmin(result && result.isAdmin);
  //       } catch (error) {
  //         setIsAdmin(false);
  //       } finally {
  //         setIsCheckingAdmin(false);
  //       }
  //     }
  //   }

  //   //checkAdminStatus();
  // }, [requireAdmin, isAuthenticated, isLoading]);

  // Only log authentication issues in development mode
  if (
    process.env.NODE_ENV === "development" &&
    !isAuthenticated &&
    !isLoading
  ) {
    console.log("Auth issue:", {
      isAuthenticated,
      isLoading,
      hasUser: !!user,
      hasSession: !!session,
    });
  }

  // if (isLoading || (requireAdmin && isCheckingAdmin)) {
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log("Not authenticated, redirecting to signin page");
    return <Navigate to="/signin" replace />;
  }

  // if (requireAdmin && isAdmin === false) {
  //   console.log("Not admin, redirecting to dashboard");
  //   return <Navigate to="/dashboard" replace />;
  // }

  // Authentication (and admin check if required) successful
  return <>{children}</>;
}

const AppShell: React.FC = () => {
  // Initialize Console stores after auth is ready (inside AuthProvider)
  const { isAuthenticated, coreToken, tokenReady, supabaseToken } = useAuth();

  const setToken = useAccountStore((s) => s.setToken);
  const fetchAccount = useAccountStore((s) => s.fetchAccount);

  const bootstrapOrgs = useOrgStore((s) => s.bootstrap);
  const selectedOrgId = useOrgStore((s) => s.selectedOrgId);

  const fetchApps = useAppStore((s) => s.fetchApps);

  // Effect A: run once when auth is ready to bootstrap account and orgs
  useEffect(() => {
    if (tokenReady && isAuthenticated) {
      // Debug
      console.log("[AppShell] authReady: bootstrap", {
        tokenReady,
        isAuthenticated,
      });

      const token = coreToken || supabaseToken || null;
      setToken(token);

      (async () => {
        await fetchAccount();
        await bootstrapOrgs();
      })();
    }
  }, [
    isAuthenticated,
    tokenReady,
    coreToken,
    supabaseToken,
    setToken,
    fetchAccount,
    bootstrapOrgs,
  ]);

  // Effect B: when org changes, fetch apps for that org (do not re-bootstrap)
  useEffect(() => {
    // Debug

    console.log("[AppShell] orgChanged: fetchApps", {
      selectedOrgId,
      isAuthenticated,
    });
    if (isAuthenticated && selectedOrgId) {
      fetchApps({ orgId: selectedOrgId });
    }
  }, [isAuthenticated, selectedOrgId, fetchApps]);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />

          {/* Login or Signup */}
          <Route path="/login" element={<LoginOrSignup />} />
          <Route path="/signup" element={<LoginOrSignup />} />
          <Route path="/signin" element={<LoginOrSignup />} />

          {/* Organization Invite */}
          <Route path="/invite/accept" element={<LoginOrSignup />} />

          {/* Forgot Password Routes */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/reset-password"
            element={<ResetPasswordPage redirectUrl="/dashboard" />}
          />

          {/* Dashboard Routes - No auth for now */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps"
            element={
              <ProtectedRoute>
                <AppList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/create"
            element={
              <ProtectedRoute>
                <CreateApp />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apps/:packageName/edit"
            element={
              <ProtectedRoute>
                <EditApp />
              </ProtectedRoute>
            }
          />

          <Route
            path="/org-settings"
            element={
              <ProtectedRoute>
                <OrganizationSettings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/members"
            element={
              <ProtectedRoute>
                <Members />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminPanel />
              </ProtectedRoute>
            }
          />

          {/* Catch-all Not Found route */}
          <Route path="*" element={<NotFound />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <OrganizationProvider>
        <Toaster />
        <TooltipProvider>
          <AppShell />
        </TooltipProvider>
      </OrganizationProvider>
    </AuthProvider>
  );
};

export default App;
