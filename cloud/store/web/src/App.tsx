import { Suspense, lazy, type ReactNode, type FC } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { PlatformProvider } from './hooks/usePlatform';
import { SearchProvider } from './contexts/SearchContext';
import { Toaster } from 'sonner';

// Lazy load pages for better performance
const AppStore = lazy(() => import('./pages/AppStore'));
const AppDetails = lazy(() => import('./pages/AppDetails'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

// Loading spinner component (simplified)
const LoadingSpinner: FC = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

// Protected route component
const ProtectedRoute: FC<{ children: ReactNode }> = ({ children }) => {
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
const AppRoutes: FC = () => {
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
const App: FC = () => {
  return (
    <PlatformProvider>
      <AuthProvider>
        <SearchProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster position="top-right" richColors />
          </BrowserRouter>
        </SearchProvider>
      </AuthProvider>
    </PlatformProvider>
  );
};

export default App;