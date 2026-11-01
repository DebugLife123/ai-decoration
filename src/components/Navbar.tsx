import { Link, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useState, type MouseEvent } from 'react';
import BrandLoading from './BrandLoading';
import './Navbar.css';

type IconName = 'home' | 'workspace' | 'templates' | 'folder';
const iconPaths: Record<IconName, string> = { home: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9.5 21v-6h5v6', workspace: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', templates: 'M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-11a2.5 2.5 0 0 1-2.5-2.5v-13ZM8 3v18M8 8h12M8 13h12', folder: 'M3.5 6.5A2.5 2.5 0 0 1 6 4h4l2 2h6A2.5 2.5 0 0 1 20.5 8.5v9A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z' };
function NavIcon({ name }: { name: IconName }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>; }
const navItems = [{ path: '/', label: '首页', icon: 'home' as IconName }, { path: '/workspace', label: '开始设计', icon: 'workspace' as IconName }, { path: '/#templates', label: '风格参考', icon: 'templates' as IconName }];

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  const startWorkspace = (event: MouseEvent<HTMLAnchorElement>, source?: string) => {
    event.preventDefault();
    if (isEntering) return;
    setMobileOpen(false);
    setIsEntering(true);
    window.setTimeout(() => {
      setIsEntering(false);
      navigate(source ? `/workspace?source=${source}` : '/workspace');
    }, 1050);
  };

  return <>
    {isEntering && <BrandLoading />}
    <button className="mobile-nav-toggle" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? '关闭导航' : '打开导航'}><span /><span /><span /></button>
    <aside className={`navbar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo" onClick={() => setMobileOpen(false)}><span className="logo-mark"><span /></span><span className="logo-text"><strong>简艺装</strong><small>JIAN YI ZHUANG</small></span></Link>
        <div className="workspace-switcher"><span className="workspace-avatar">J</span><span><strong>个人工作区</strong><small>Personal workspace</small></span></div>
        <nav className="navbar-links" aria-label="主导航">
          <div className="nav-group"><div className="nav-group-label">我的设计</div>{navItems.map((item) => { const routePath = item.path.split('#')[0]; const active = routePath === '/' ? location.pathname === '/' : location.pathname.startsWith(routePath); return <Link key={item.path} to={item.path} className={`nav-link ${active ? 'active' : ''}`} onClick={(event) => item.path === '/workspace' ? startWorkspace(event) : setMobileOpen(false)}><NavIcon name={item.icon} /><span>{item.label}</span>{item.path === '/workspace' && <span className="nav-new">P0</span>}</Link>; })}</div>
          <div className="nav-group"><div className="nav-group-label">快速入口</div><Link to="/workspace?source=cad" className="nav-link" onClick={(event) => startWorkspace(event, 'cad')}><NavIcon name="folder" /><span>CAD 全屋渲染</span></Link><Link to="/workspace?source=floorplan" className="nav-link" onClick={(event) => startWorkspace(event, 'floorplan')}><NavIcon name="workspace" /><span>户型图设计</span></Link></div>
        </nav>
        <div className="navbar-bottom"><div className="nav-note"><span>i</span><p><strong>个人 C 端原型</strong><small>先完成设计闭环，再接入 AI 服务</small></p></div><div className="nav-user"><span className="user-avatar">W</span><span><strong>我的设计空间</strong><small>Prototype / 2026</small></span></div></div>
      </div>
    </aside>
  </>;
}
