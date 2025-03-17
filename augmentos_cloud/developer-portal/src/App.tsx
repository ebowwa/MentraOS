// App.tsx
import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// Pages
import LandingPage from './pages/LandingPage';
import DashboardHome from './pages/DashboardHome';

import LoginOrSignup from './pages/AuthPage';
import TPAList from './pages/TPAList';
import CreateTPA from './pages/CreateTPA';
import EditTPA from './pages/EditTPA';
import Profile from './pages/Profile';
import AdminPanel from './pages/AdminPanel';
import NotFound from './pages/NotFound';
import { AuthProvider, useAuth } from './hooks/useAuth';

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user, session } = useAuth();

  // Enhanced logging for debugging authentication problems
  console.log('ProtectedRoute check:', { 
    isAuthenticated, 
    isLoading, 
    hasUser: !!user, 
    hasSession: !!session,
    pathname: window.location.pathname 
  });

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('Not authenticated, redirecting to signin page');
    return <Navigate to="/signin" replace />;
  }

  console.log('User is authenticated, rendering protected content');
  return <>{children}</>;
}

const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />

          {/* Login or Signup */}
          <Route path="/login" element={<LoginOrSignup />} />
          <Route path="/signup" element={<LoginOrSignup />} />
          <Route path="/signin" element={<LoginOrSignup />} />

          {/* Dashboard Routes - No auth for now */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardHome />
            </ProtectedRoute>
          } />
          <Route path="/tpas" element={
            <ProtectedRoute>
              <TPAList />
            </ProtectedRoute>
          } />
          <Route path="/tpas/create" element={
            <ProtectedRoute>
              <CreateTPA />
            </ProtectedRoute>
          } />
          <Route path="/tpas/:packageName/edit" element={
            <ProtectedRoute>
              <EditTPA />
            </ProtectedRoute>
          } />
          
          <Route path="/profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          } />

          {/* Catch-all Not Found route */}
          <Route path="*" element={<NotFound />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;