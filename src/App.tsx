import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import ProjectsPage from './pages/ProjectsPage';
import MaterialsPage from './pages/MaterialsPage';
import BusinessPage from './pages/BusinessPage';
import { useAppStore } from './stores/appStore';
import './App.css';

function RoleRoute({ role, children }: { role: 'consumer' | 'business'; children: ReactNode }) {
  const currentRole = useAppStore((state) => state.role);
  const navigate = useNavigate();
  const location = useLocation();
  const target = currentRole === 'business' ? '/business' : '/';

  useEffect(() => {
    if (currentRole !== role && location.pathname !== target) navigate(target, { replace: true });
  }, [currentRole, location.pathname, navigate, role, target]);

  if (currentRole !== role) return <Navigate to={target} replace />;
  return <>{children}</>;
}

function App() {
  const role = useAppStore((state) => state.role);
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<RoleRoute role="consumer"><HomePage /></RoleRoute>} />
          <Route path="/workspace" element={<RoleRoute role="consumer"><WorkspacePage /></RoleRoute>} />
          <Route path="/projects" element={<RoleRoute role="consumer"><ProjectsPage /></RoleRoute>} />
          <Route path="/materials" element={<RoleRoute role="consumer"><MaterialsPage /></RoleRoute>} />
          <Route path="/business" element={<RoleRoute role="business"><BusinessPage /></RoleRoute>} />
          <Route path="*" element={<Navigate to={role === 'business' ? '/business' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
