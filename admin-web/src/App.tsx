import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { ToastProvider } from './components/Toast';
import { RequireAuth } from './RequireAuth';
import AppLayout from './AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BusinessesPage from './pages/BusinessesPage';
import UsersPage from './pages/UsersPage';
import ConversationsPage from './pages/ConversationsPage';
import MessageSearchPage from './pages/MessageSearchPage';
import ReportsPage from './pages/ReportsPage';
import MomentsModerationPage from './pages/MomentsModerationPage';
import MusicCatalogPage from './pages/MusicCatalogPage';
import CommerceProductsPage from './pages/CommerceProductsPage';
import CommerceServicesPage from './pages/CommerceServicesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HealthPage from './pages/HealthPage';
import BroadcastPage from './pages/BroadcastPage';
import AuditLogPage from './pages/AuditLogPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="businesses" element={<BusinessesPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="conversations" element={<ConversationsPage />} />
              <Route path="messages" element={<MessageSearchPage />} />
              <Route path="moments" element={<MomentsModerationPage />} />
              <Route path="music" element={<MusicCatalogPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="products" element={<CommerceProductsPage />} />
              <Route path="services" element={<CommerceServicesPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="health" element={<HealthPage />} />
              <Route path="broadcast" element={<BroadcastPage />} />
              <Route path="audit-logs" element={<AuditLogPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
