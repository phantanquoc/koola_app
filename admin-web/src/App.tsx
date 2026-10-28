import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { AppQueryProvider } from './queryClient';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RequireAuth } from './RequireAuth';
import AppLayout from './AppLayout';
import LoginPage from './pages/LoginPage';
import ForbiddenPage from './pages/ForbiddenPage';
import DashboardPage from './pages/DashboardPage';
import BusinessesPage from './pages/BusinessesPage';
import BusinessDetailPage from './pages/BusinessDetailPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import ConversationsPage from './pages/ConversationsPage';
import MessageSearchPage from './pages/MessageSearchPage';
import ReportsPage from './pages/ReportsPage';
import ReportDetailPage from './pages/ReportDetailPage';
import MomentsModerationPage from './pages/MomentsModerationPage';
import MusicCatalogPage from './pages/MusicCatalogPage';
import CommerceProductsPage from './pages/CommerceProductsPage';
import CommerceOrdersPage from './pages/CommerceOrdersPage';
import CommerceServicesPage from './pages/CommerceServicesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import HealthPage from './pages/HealthPage';
import BroadcastPage from './pages/BroadcastPage';
import AuditLogPage from './pages/AuditLogPage';
import AuditLogDetailPage from './pages/AuditLogDetailPage';
import ConfigPage from './pages/ConfigPage';
import OpsLogPage from './pages/OpsLogPage';
import ModerationQueuePage from './pages/ModerationQueuePage';
import AppealsPage from './pages/AppealsPage';
import RevenuePage from './pages/RevenuePage';

export default function App() {
  return (
    <ErrorBoundary>
      <AppQueryProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forbidden" element={<ForbiddenPage />} />
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
                <Route path="businesses/new" element={<BusinessDetailPage />} />
                <Route path="businesses/:id" element={<BusinessDetailPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:id" element={<UserDetailPage />} />
                <Route path="conversations" element={<ConversationsPage />} />
                <Route path="messages" element={<MessageSearchPage />} />
                <Route path="moments" element={<MomentsModerationPage />} />
                <Route path="music" element={<MusicCatalogPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="reports/:id" element={<ReportDetailPage />} />
                <Route path="products" element={<CommerceProductsPage />} />
                <Route path="orders" element={<CommerceOrdersPage />} />
                <Route path="services" element={<CommerceServicesPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="health" element={<HealthPage />} />
                <Route path="broadcast" element={<BroadcastPage />} />
                <Route path="audit-logs" element={<AuditLogPage />} />
                <Route path="audit-logs/:id" element={<AuditLogDetailPage />} />
                <Route path="moderation-queue" element={<ModerationQueuePage />} />
                <Route path="appeals" element={<AppealsPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="ops-logs" element={<OpsLogPage />} />
                <Route path="revenue" element={<RevenuePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
      </AppQueryProvider>
    </ErrorBoundary>
  );
}
