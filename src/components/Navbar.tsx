import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import './Navbar.css';

type IconName = 'home' | 'workspace' | 'projects' | 'templates' | 'materials' | 'business' | 'help' | 'settings';

const iconPaths: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9.5 21v-6h5v6',
  workspace: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  projects: 'm12 3 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 17l8 4 8-4',
  templates: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18.5v-13ZM8 3v18M8 8h12M8 13h12',
  materials: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM7 16l3-3 2 2 3-4 3 5',
  business: 'M4 20V8h16v12M2 20h20M7 8V5h10v3M8 12h2M14 12h2M8 16h2M14 16h2',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.6 9a2.5 2.5 0 1 1 4.6 1.3c-.8 1.2-2.2 1.3-2.2 3M12 17h.01',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.5 1.5-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.1v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.5-1.5.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H7v-2.1h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.5-1.5.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V5h2.1v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.5 1.5-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2V13h-.2a1.7 1.7 0 0 0-1.6 1Z',
};

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name]} />
    </svg>
  );
}

const consumerNavGroups = [
  { label: '创作空间', items: [
    { path: '/', label: '灵感首页', icon: 'home' as IconName },
    { path: '/workspace', label: '设计工作台', icon: 'workspace' as IconName },
    { path: '/projects', label: '我的项目', icon: 'projects' as IconName },
    { path: '/#templates', label: '方案模板', icon: 'templates' as IconName },
  ] },
  { label: '资源中心', items: [{ path: '/materials', label: '材料库', icon: 'materials' as IconName }] },
];

const businessNavGroups = [
  { label: '企业工作区', items: [{ path: '/business', label: '企业业务', icon: 'business' as IconName }] },
];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, setRole } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isBusiness = role === 'business';
  const navGroups = isBusiness ? businessNavGroups : consumerNavGroups;

  const switchRole = (nextRole: 'consumer' | 'business') => {
    setRole(nextRole);
    setMobileOpen(false);
    navigate(nextRole === 'business' ? '/business' : '/');
  };

  return (
    <>
      <button className="mobile-nav-toggle" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? '关闭导航' : '打开导航'}>
        <span />
        <span />
        <span />
      </button>

      <aside className={`navbar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="navbar-inner">
          <Link to="/" className="navbar-logo" onClick={() => setMobileOpen(false)}>
            <span className="logo-mark"><span /></span>
            <span className="logo-text">
              <strong>筑境 AI</strong>
              <small>HOME STUDIO</small>
            </span>
          </Link>

          <div className={`workspace-switcher ${isBusiness ? 'business-mode' : ''}`}>
            <span className="workspace-avatar">{isBusiness ? 'B' : 'W'}</span>
            <span><strong>{isBusiness ? '企业工作区' : '个人工作区'}</strong><small>{isBusiness ? 'Business workspace' : 'Personal workspace'}</small></span>
            <span className="switcher-caret">⌄</span>
          </div>

          <nav className="navbar-links" aria-label="主导航">
            {navGroups.map((group) => (
              <div className="nav-group" key={group.label}>
                <div className="nav-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const routePath = item.path.split('#')[0];
                  const active = routePath === '/' ? location.pathname === '/' && (item.path === '/' || location.hash === item.path.split('#')[1]) : location.pathname.startsWith(routePath);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`nav-link ${active ? 'active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <NavIcon name={item.icon} />
                      <span>{item.label}</span>
                      {item.path === '/workspace' && <span className="nav-new">P0</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="navbar-bottom">
            <div className="role-switcher" aria-label="端选择">
              <button className={role === 'consumer' ? 'active' : ''} onClick={() => switchRole('consumer')}>用户端</button>
              <button className={role === 'business' ? 'active' : ''} onClick={() => switchRole('business')}>企业端</button>
            </div>
            <Link to={isBusiness ? '/business' : '/'} className="nav-help" onClick={() => setMobileOpen(false)}>
              <NavIcon name="help" />
              <span>帮助与反馈</span>
            </Link>
            <button className="nav-user">
              <span className="user-avatar">王</span>
              <span><strong>王宇翔</strong><small>Free plan</small></span>
              <NavIcon name="settings" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
