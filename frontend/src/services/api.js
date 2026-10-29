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
      // Clear expired session if on an authenticated route
      const hadToken = Boolean(localStorage.getItem('token'));
      const isPublicPath = window.location.pathname.startsWith('/share/') || window.location.pathname === '/login' || window.location.pathname === '/signup';
      if (hadToken && !isPublicPath) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new CustomEvent('auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export default api;
