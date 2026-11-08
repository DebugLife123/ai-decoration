import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import InspirationPage from './pages/InspirationPage';
import WorkspacePage from './pages/WorkspacePage';
import ProjectsPage from './pages/ProjectsPage';
import MaterialsPage from './pages/MaterialsPage';
import CaseCatalogPage from './pages/CaseCatalogPage';
import BudgetPage from './pages/BudgetPage';
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
import NotificationsPage from './pages/NotificationsPage';
import { useAppStore } from './stores/appStore';
import './App.css';

function RoleRoute({ role, children }: { role: 'consumer' | 'business'; children: ReactNode }) {
  const currentRole = useAppStore((state) => state.role);
  const location = useLocation();
  const isAuthenticated = useAppStore((state) => Boolean(state.authSession));
  const target = currentRole === 'business' ? '/business' : currentRole === 'admin' ? '/admin' : '/';

  if (!isAuthenticated) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (currentRole !== role) return <Navigate to={target} replace />;
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

  useEffect(() => {
    if (isAuthenticated && role !== 'admin') void loadProjects();
  }, [isAuthenticated, loadProjects, role]);

  return (
    <div className={`app ${!isAuthenticated ? 'auth-app' : ''} ${role === 'admin' ? 'admin-app' : ''}`}>
      {isAuthenticated && role !== 'admin' && <Navbar />}
      <main className="app-main">
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to={role === 'business' ? '/business' : role === 'admin' ? '/admin' : '/'} replace /> : <LoginPage />} />
          <Route path="/admin/login" element={isAuthenticated ? <Navigate to={role === 'admin' ? '/admin' : role === 'business' ? '/business' : '/'} replace /> : <AdminLoginPage />} />
          <Route path="/" element={<RoleRoute role="consumer"><HomePage /></RoleRoute>} />
          <Route path="/inspiration" element={<RoleRoute role="consumer"><InspirationPage /></RoleRoute>} />
          <Route path="/workspace" element={<RoleRoute role="consumer"><WorkspacePage /></RoleRoute>} />
          <Route path="/cad-workflow" element={<RoleRoute role="consumer"><CadWorkflowPage /></RoleRoute>} />
          <Route path="/projects" element={<RoleRoute role="consumer"><ProjectsPage /></RoleRoute>} />
          <Route path="/materials" element={<RoleRoute role="consumer"><MaterialsPage /></RoleRoute>} />
          <Route path="/cases" element={<RoleRoute role="consumer"><CaseCatalogPage /></RoleRoute>} />
          <Route path="/companies/:companyId" element={<RoleRoute role="consumer"><CompanyPage /></RoleRoute>} />
          <Route path="/notifications" element={<RoleRoute role="consumer"><NotificationsPage /></RoleRoute>} />
          <Route path="/business/notifications" element={<RoleRoute role="business"><NotificationsPage /></RoleRoute>} />
          <Route path="/budget" element={<RoleRoute role="consumer"><BudgetPage /></RoleRoute>} />
          <Route path="/business" element={<RoleRoute role="business"><BusinessPage /></RoleRoute>} />
          <Route path="/business/styles" element={<RoleRoute role="business"><BusinessStylesPage /></RoleRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
          <Route path="/admin/assets" element={<AdminRoute><AdminAssetsPage /></AdminRoute>} />
          <Route path="/admin/marketplace" element={<AdminRoute><AdminMarketplacePage /></AdminRoute>} />
          <Route path="/admin/marketplace/companies/:companyId" element={<AdminRoute><AdminCompanyDetailPage /></AdminRoute>} />
          <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
          <Route path="/admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
          <Route path="*" element={<Navigate to={role === 'business' ? '/business' : role === 'admin' ? '/admin' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
