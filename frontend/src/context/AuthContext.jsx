import { createContext, useState, useCallback, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem('user');
      return storedUser ? JSON.parse(storedUser) : null;
    } catch(e) {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', credentials);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const signup = useCallback(async (newAccount) => {
    setLoading(true);
    setError(null);
    try {
      const name = newAccount.name || newAccount.fullName || 'New User';
      const res = await api.post('/auth/register', {
        name,
        email: newAccount.email,
        password: newAccount.password,
      });
      // Use the registration response token and user info directly
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const updated = prev ? { ...prev, ...patch } : prev;
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateUserProfile = useCallback(async (patch) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.put('/auth/profile', patch);
      const updated = res.data.user;
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
      return updated;
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = { user, loading, error, login, signup, logout, updateUser, updateUserProfile, setUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
