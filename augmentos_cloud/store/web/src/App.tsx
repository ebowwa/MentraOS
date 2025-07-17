import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { PlatformProvider } from './hooks/usePlatform';
import { Toaster } from 'sonner';

// Lazy load pages for better performance
const AppStore = React.lazy(() => import('./pages/AppStore'));
const AppDetails = React.lazy(() => import('./pages/AppDetails'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const NotFound = React.lazy(() => import('./pages/NotFound'));

// Loading spinner component (simplified)
const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

// Protected route component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Main routes component
const AppRoutes: React.FC = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<AppStore />} />
        <Route path="/package/:packageName" element={<AppDetails />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/webview" element={
          <ProtectedRoute>
            <AppStore />
          </ProtectedRoute>
        } />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
};

// Main App component
const App: React.FC = () => {
  return (
    <PlatformProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </PlatformProvider>
  );
};

export default App;