import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import AccountPage from './pages/AccountPage'
import DeleteAccountPage from './pages/DeleteAccountPage'
import ExportDataPage from './pages/ExportDataPage'
// import DashboardLayout from './components/DashboardLayout'
import { useAuth } from './hooks/useAuth'

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, user, session } = useAuth();

  // Don't redirect immediately while still loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Check for the core token as an additional authentication check
  const hasCoreToken = !!localStorage.getItem('core_token');

  // Only redirect when we're confident the user isn't authenticated
  if (!isAuthenticated && !loading && !user && !session && !hasCoreToken) {
    console.log('User not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};


function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          
          <Route path="/account" element={
            <ProtectedRoute>
              <AccountPage />
            </ProtectedRoute>
          } />
          
          <Route path="/account/delete" element={
            <ProtectedRoute>
              <DeleteAccountPage />
            </ProtectedRoute>
          } />
          
          <Route path="/account/export" element={
            <ProtectedRoute>
              <ExportDataPage />
            </ProtectedRoute>
          } />
          
          <Route path="/" element={<Navigate to="/account" replace />} />
          
          {/* Catch-all route for authenticated users */}
          <Route path="/verified-email" element={<Navigate to="/account" replace />} />
          
          {/* General 404 route */}
          <Route path="*" element={
            <div className="flex flex-col items-center justify-center min-h-screen">
              <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
              <p className="mb-6">The page you are looking for doesn't exist or has been moved.</p>
              <a href="/" className="text-blue-600 hover:underline">Go back to home</a>
            </div>
          } />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App