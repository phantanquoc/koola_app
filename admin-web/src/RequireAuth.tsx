import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

/**
 * Wraps protected pages. Redirects to /login when not authenticated.
 * The axios interceptor handles 401/403 mid-session redirects.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
