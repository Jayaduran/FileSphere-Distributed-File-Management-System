import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { FilesProvider } from './context/FilesContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Help from './pages/Help';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import PublicSharePage from './pages/PublicSharePage';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RootRedirect() {
  const { user } = useAuth();
  const token = localStorage.getItem('token');
  if (user || token) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

function LegacyLinkRedirect() {
  const { token } = useParams();
  return <Navigate to={`/share/${encodeURIComponent(token || '')}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* Public Share Routes — No Authentication Required */}
      <Route path="/share/:token" element={<PublicSharePage />} />
      <Route path="/share" element={<PublicSharePage />} />
      <Route path="/public/:token" element={<LegacyLinkRedirect />} />
      <Route path="/api/public/files/link/:token" element={<LegacyLinkRedirect />} />

      {/* Authenticated Workspace Routes */}
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/starred"        element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/shared"         element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/shared-with-me" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/shared-by-me"   element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/recent"         element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/trash"     element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/settings"  element={<RequireAuth><Settings  /></RequireAuth>} />
      <Route path="/help"      element={<RequireAuth><Help      /></RequireAuth>} />
      
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'dummy-client-id';
  return (
    <GoogleOAuthProvider clientId={clientId}>
      <BrowserRouter>
        <AuthProvider>
          <FilesProvider>
            <AppRoutes />
          </FilesProvider>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  );
}
