import axios from 'axios';
import { config } from './config';
import { tokenStorage } from './tokenStorage';

/**
 * Axios instance for the admin API.
 *
 * - Attaches Bearer token from tokenStorage on every request.
 * - On 401 or 403 response: clears the stored token and redirects
 *   to /login so the user is never left in a broken auth state.
 */
const apiClient = axios.create({
  baseURL: config.apiUrl,
});

// Request interceptor — attach token
apiClient.interceptors.request.use((reqConfig) => {
  const token = tokenStorage.get();
  if (token) {
    reqConfig.headers.Authorization = `Bearer ${token}`;
  }
  return reqConfig;
});

// Response interceptor — handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        tokenStorage.clear();
        // Redirect to login — works outside React Router context too
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
