import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const msg = (error.response.data?.message || '').toLowerCase();
      const isAuthUrl = error.config?.url?.includes('/auth/');
      const isTokenExpired = msg.includes('jwt expired') || msg.includes('invalid token') || msg.includes('authentication required');

      // Only invalidate session if this is an explicit auth check failure or expired token
      if (isAuthUrl || isTokenExpired) {
        const isPublicPath = window.location.pathname.startsWith('/share/') || window.location.pathname === '/login' || window.location.pathname === '/signup';
        if (!isPublicPath) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.dispatchEvent(new CustomEvent('auth-expired'));
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
