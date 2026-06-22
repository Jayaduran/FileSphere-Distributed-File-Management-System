import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { FilesProvider } from './context/FilesContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      {/* /mock-google-login removed — using real Google OAuth now */}
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/starred"   element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/shared"    element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/recent"    element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/trash"     element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/settings"  element={<RequireAuth><Settings  /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
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
