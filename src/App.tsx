import BusinessStyleSubmissionsPage from './pages/BusinessStyleSubmissionsPage';
import MyInquiriesPage from './pages/MyInquiriesPage';
import InspirationSubmissionsPage from './pages/InspirationSubmissionsPage';
import AdminBudgetSettingsPage from './pages/AdminBudgetSettingsPage';
import AdminPlatformContactPage from './pages/AdminPlatformContactPage';
import AdminStyleMaterialsPage from './pages/AdminStyleMaterialsPage';
import AdminInspirationPage from './pages/AdminInspirationPage';
import AdminAccountsPage from './pages/AdminAccountsPage';
import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import InspirationPage from './pages/InspirationPage';
import WorkspacePage from './pages/WorkspacePage';
import ProjectsPage from './pages/ProjectsPage';
import MaterialsPage from './pages/MaterialsPage';
import CaseCatalogPage from './pages/CaseCatalogPage';
import BudgetPage from './pages/BudgetPage';
import SubscriptionPage from './pages/SubscriptionPage';
import BusinessPage from './pages/BusinessPage';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import AdminAssetsPage from './pages/AdminAssetsPage';
import AdminAuditPage from './pages/AdminAuditPage';
import AdminMarketplacePage from './pages/AdminMarketplacePage';
import AdminCompanyDetailPage from './pages/AdminCompanyDetailPage';
import CompanyPage from './pages/CompanyPage';
import BusinessStylesPage from './pages/BusinessStylesPage';
import CadWorkflowPage from './pages/CadWorkflowPage';
import CanvasPage from './pages/CanvasPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import { useAppStore } from './stores/appStore';
import './App.css';
import './ConsumerLayout.css';
import AdminCreditsPage from './pages/AdminCreditsPage';
import AdminSubscriptionOrdersPage from './pages/AdminSubscriptionOrdersPage';
import { CertificationPaymentsPanel as AdminCertificationPaymentsPage } from './pages/AdminCertificationPaymentsPage';
import AdminResellersPage from './pages/AdminResellersPage';
import ResellerPage from './pages/ResellerPage';
import ResellerLoginPage from './pages/ResellerLoginPage';

function RoleRoute({ role, children }: { role: 'consumer' | 'business' | 'reseller'; children: ReactNode }) {
  const currentRole = useAppStore((state) => state.role);
  const location = useLocation();
  const isAuthenticated = useAppStore((state) => Boolean(state.authSession));
  const target = currentRole === 'reseller' ? '/reseller' : currentRole === 'business' ? '/business' : currentRole === 'admin' ? '/admin' : '/';

  if (!isAuthenticated) return <Navigate to={`${role === 'reseller' ? '/reseller/login' : '/login'}?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (currentRole !== role) return <Navigate to={target} replace />;
  return <>{children}</>;
}

function CanvasRoute({ children }: { children: ReactNode }) {
  const currentRole = useAppStore((state) => state.role);
  const location = useLocation();
  const isAuthenticated = useAppStore((state) => Boolean(state.authSession));
  const isLocalCanvasDevelopment = import.meta.env.DEV && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (!isAuthenticated && isLocalCanvasDevelopment) return <>{children}</>;
  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (currentRole !== 'consumer') return <Navigate to={currentRole === 'business' ? '/business' : currentRole === 'admin' ? '/admin' : '/'} replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const currentRole = useAppStore((state) => state.role);
  const location = useLocation();
  const isAuthenticated = useAppStore((state) => Boolean(state.authSession));

  if (!isAuthenticated) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (currentRole !== 'admin') return <Navigate to={currentRole === 'business' ? '/business' : '/'} replace />;
  return <>{children}</>;
}

function App() {
  const role = useAppStore((state) => state.role);
  const isAuthenticated = useAppStore((state) => Boolean(state.authSession));
  const loadProjects = useAppStore((state) => state.loadProjects);
  const location = useLocation();
  const isPublicHome = !isAuthenticated && location.pathname === '/';

  useEffect(() => {
    if (isAuthenticated && role !== 'admin' && role !== 'reseller') void loadProjects();
  }, [isAuthenticated, loadProjects, role]);

  return (
    <div className={`app ${!isAuthenticated ? 'auth-app' : ''} ${role === 'admin' ? 'admin-app' : ''} ${(isAuthenticated && role === 'consumer') || isPublicHome ? 'consumer-app' : ''}`}>
      {((isAuthenticated && role !== 'admin' && role !== 'reseller') || isPublicHome) && <Navbar />}
      <main className="app-main">
        <Routes>
          <Route path="/admin/credits" element={<AdminRoute><AdminCreditsPage /></AdminRoute>} />
          <Route path="/admin/subscription-orders" element={<AdminRoute><AdminSubscriptionOrdersPage /></AdminRoute>} />
          <Route path="/admin/certification-payments" element={<AdminRoute><AdminCertificationPaymentsPage /></AdminRoute>} />
          <Route path="/admin/resellers" element={<AdminRoute><AdminResellersPage /></AdminRoute>} />
          <Route path="/reseller/login" element={isAuthenticated ? <Navigate to={role === 'reseller' ? '/reseller' : '/'} replace /> : <ResellerLoginPage />} />
          <Route path="/reseller" element={<RoleRoute role="reseller"><ResellerPage /></RoleRoute>} />
          <Route path="/login" element={isAuthenticated ? <Navigate to={role === 'business' ? '/business' : role === 'admin' ? '/admin' : '/'} replace /> : <LoginPage />} />
          <Route path="/admin/login" element={isAuthenticated ? <Navigate to={role === 'admin' ? '/admin' : role === 'business' ? '/business' : '/'} replace /> : <AdminLoginPage />} />
          <Route path="/" element={isAuthenticated ? <RoleRoute role="consumer"><LandingPage /></RoleRoute> : <LandingPage />} />
          <Route path="/inspiration" element={<RoleRoute role="consumer"><InspirationPage /></RoleRoute>} />
          <Route path="/workspace" element={<RoleRoute role="consumer"><WorkspacePage /></RoleRoute>} />
          <Route path="/cad-workflow" element={<RoleRoute role="consumer"><CadWorkflowPage /></RoleRoute>} />
          <Route path="/canvas" element={<CanvasRoute><CanvasPage /></CanvasRoute>} />
          <Route path="/canvas/:id" element={<CanvasRoute><CanvasPage /></CanvasRoute>} />
          <Route path="/projects" element={<RoleRoute role="consumer"><ProjectsPage /></RoleRoute>} />
          <Route path="/materials" element={<RoleRoute role="consumer"><MaterialsPage /></RoleRoute>} />
          <Route path="/cases" element={<RoleRoute role="consumer"><CaseCatalogPage /></RoleRoute>} />
          <Route path="/companies/:companyId" element={<RoleRoute role="consumer"><CompanyPage /></RoleRoute>} />
          <Route path="/notifications" element={<RoleRoute role="consumer"><NotificationsPage /></RoleRoute>} />
          <Route path="/business/notifications" element={<RoleRoute role="business"><NotificationsPage /></RoleRoute>} />
          <Route path="/budget" element={<RoleRoute role="consumer"><BudgetPage /></RoleRoute>} />
          <Route path="/subscription" element={<RoleRoute role="consumer"><SubscriptionPage /></RoleRoute>} />
          <Route path="/profile" element={<RoleRoute role="consumer"><ProfilePage /></RoleRoute>} />
          <Route path="/business" element={<RoleRoute role="business"><BusinessPage /></RoleRoute>} />
          <Route path="/business/styles" element={<RoleRoute role="business"><BusinessStylesPage /></RoleRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="/admin/assets" element={<AdminRoute><AdminAssetsPage /></AdminRoute>} />
          <Route path="/admin/marketplace" element={<AdminRoute><AdminMarketplacePage /></AdminRoute>} />
          <Route path="/admin/marketplace/companies/:companyId" element={<AdminRoute><AdminCompanyDetailPage /></AdminRoute>} />
          <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
          <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
          <Route path="/admin/accounts" element={<AdminRoute><AdminAccountsPage /></AdminRoute>} />
          <Route path="/admin/inspiration" element={<AdminRoute><AdminInspirationPage /></AdminRoute>} />
          <Route path="/admin/style-materials" element={<AdminRoute><AdminStyleMaterialsPage /></AdminRoute>} />
          <Route path="/admin/platform-contact" element={<AdminRoute><AdminPlatformContactPage /></AdminRoute>} />
          <Route path="/admin/budget-settings" element={<AdminRoute><AdminBudgetSettingsPage /></AdminRoute>} />
          <Route path="/inspiration/submissions" element={<RoleRoute role="consumer"><InspirationSubmissionsPage /></RoleRoute>} />
          <Route path="/inquiries" element={<RoleRoute role="consumer"><MyInquiriesPage /></RoleRoute>} />
          <Route path="/business/style-submissions" element={<RoleRoute role="business"><BusinessStyleSubmissionsPage /></RoleRoute>} />
          <Route path="*" element={<Navigate to={role === 'business' ? '/business' : role === 'admin' ? '/admin' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
