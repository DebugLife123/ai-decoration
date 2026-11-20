import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Menu, X, LogOut, UserRound, Layers, WandSparkles, FolderOpen, LayoutDashboard, Ruler, Image, Calculator, Building2, Crown } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { loadUserProfile } from '../services/userProfile';
import { toggleReferenceTheme, useReferenceTheme } from '../services/referenceTheme';
import './Navbar.css';
import './ReferenceTheme.css';

type NavItem = { path: string; label: string; detail?: string; icon?: ReactNode };
const creationItems: NavItem[] = [
  { path: '/workspace', label: '设计工作台', detail: '从空间灵感到设计方案', icon: <WandSparkles /> },
  { path: '/cad-workflow', label: 'CAD 全屋渲染', detail: '上传户型，开启全屋设计', icon: <Ruler /> },
  { path: '/canvas', label: '空间设计画布', detail: '自由编排你的空间创意', icon: <Layers /> },
];
const resourceItems: NavItem[] = [
  { path: '/materials', label: '材料库', detail: '发现适合你的装修材料', icon: <Image /> },
  { path: '/cases', label: '认证企业案例', detail: '浏览真实空间与设计案例', icon: <Building2 /> },
  { path: '/budget', label: '预算试算', detail: '让每一份预算心中有数', icon: <Calculator /> },
];
const businessItems: NavItem[] = [
  { path: '/business?tab=overview', label: '企业概览' },
  { path: '/business?tab=cases', label: '案例资料' },
  { path: '/business?tab=materials', label: '材料报价' },
  { path: '/business?tab=workers', label: '人工报价' },
  { path: '/business?tab=inquiries', label: '客户咨询' },
  { path: '/business/notifications', label: '通知中心' },
  { path: '/business?tab=certification', label: '认证资料' },
  { path: '/business/styles', label: '风格资料' },
];

// Adapted from the handoff index.html pill markup; duplicate labels are decorative.
function PillLabel({ children }: { children: ReactNode }) {
  return <><span className="pill-hover-circle" aria-hidden="true" /><span className="pill-label-stack"><span className="pill-label">{children}</span><span className="pill-label-hover" aria-hidden="true">{children}</span></span></>;
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, authSession, signOut } = useAppStore();
  const headerRef = useRef<HTMLElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 40);
  const theme = useReferenceTheme();
  const isAuthenticated = !!authSession;
  const isBusiness = isAuthenticated && role === 'business';
  const isHome = !isBusiness && location.pathname === '/';
  const navProfile = authSession?.user ? loadUserProfile(authSession.user.id) : null;
  const displayName = navProfile?.displayName.trim() || authSession?.user.displayName || '已登录用户';
  const homePath = isBusiness ? '/business' : '/';
  const notificationPath = isBusiness ? '/business/notifications' : '/notifications';

  const closeMenus = () => { setOpenMenu(null); setMobileOpen(false); };
  const routeKey = `${location.pathname}${location.search}${location.hash}`;
  const [menuRoute, setMenuRoute] = useState(routeKey);
  if (menuRoute !== routeKey) {
    setMenuRoute(routeKey);
    setOpenMenu(null);
    setMobileOpen(false);
  }
  useEffect(() => {
    if (mobileOpen) headerRef.current?.querySelector<HTMLElement>('.main-nav a, .main-nav button')?.focus();
  }, [mobileOpen]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) closeMenus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openMenu) { setOpenMenu(null); dropdownTriggerRef.current?.focus(); }
      else if (mobileOpen) { setMobileOpen(false); mobileTriggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [openMenu, mobileOpen]);

  // Exact circle geometry from reference app.js layoutAnimatedPills, kept responsive.
  useEffect(() => {
    const pills = headerRef.current?.querySelectorAll<HTMLElement>('.pill-animated');
    const layout = () => pills?.forEach((pill) => {
      const circle = pill.querySelector<HTMLElement>('.pill-hover-circle');
      const { width, height } = pill.getBoundingClientRect();
      if (!circle || !width || !height) return;
      const radius = ((width * width) / 4 + height * height) / (2 * height);
      const diameter = Math.ceil(2 * radius) + 2;
      const delta = Math.ceil(radius - Math.sqrt(Math.max(0, radius * radius - (width * width) / 4))) + 1;
      circle.style.width = `${diameter}px`;
      circle.style.height = `${diameter}px`;
      circle.style.bottom = `-${delta}px`;
      pill.style.setProperty('--pill-origin-y', `${diameter - delta}px`);
      pill.style.setProperty('--pill-travel', `${height + 8}px`);
    });
    const observer = new ResizeObserver(layout);
    pills?.forEach((pill) => observer.observe(pill));
    layout();
    return () => observer.disconnect();
  }, [isBusiness, isAuthenticated]);

  const isActive = (path: string) => {
    const [pathname, search] = path.split('?');
    if (pathname === '/') return location.pathname === '/';
    const matchesPath = location.pathname === pathname || location.pathname.startsWith(`${pathname}/`);
    const tab = new URLSearchParams(search).get('tab');
    if (tab) return location.pathname === pathname && (new URLSearchParams(location.search).get('tab') || 'overview') === tab;
    return matchesPath;
  };
  const toggleMenu = (id: string, trigger: HTMLButtonElement) => {
    dropdownTriggerRef.current = trigger;
    setOpenMenu((current) => current === id ? null : id);
  };
  const renderLink = (item: NavItem) => <span className="pill-nav-slot" key={item.path}><Link to={item.path} onClick={closeMenus} className={`pill-nav-item pill-animated${isActive(item.path) ? ' is-active' : ''}`} aria-current={isActive(item.path) ? 'page' : undefined}><PillLabel>{item.label}</PillLabel></Link></span>;
  const renderDropdown = (id: string, label: string, items: NavItem[]) => <div className="pill-nav-slot dropdown-slot" key={id}>
    <button type="button" id={`jyz-trigger-${id}`} className={`pill-nav-item pill-animated${items.some((item) => isActive(item.path)) ? ' is-active' : ''}`} aria-expanded={openMenu === id} aria-controls={`jyz-panel-${id}`} onClick={(event) => toggleMenu(id, event.currentTarget)}>
      <PillLabel>{label}<ChevronDown className="nav-chevron" /></PillLabel>
    </button>
    <div className="nav-dropdown" id={`jyz-panel-${id}`} aria-labelledby={`jyz-trigger-${id}`} hidden={openMenu !== id}>
      <p className="dropdown-heading">{label}</p>
      {items.map((item) => <Link key={item.path} to={item.path} className={`dropdown-link${isActive(item.path) ? ' is-active' : ''}`} onClick={closeMenus} aria-current={isActive(item.path) ? 'page' : undefined}><span className="dropdown-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><span className="dropdown-arrow" aria-hidden="true">↗</span></Link>)}
    </div>
  </div>;

  return <header ref={headerRef} className={`navbar jyz-header${!isHome || scrolled ? ' scrolled' : ''}${mobileOpen ? ' mobile-nav-open' : ''}${isBusiness ? ' business-header' : ''}`} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) closeMenus();
  }}>
    <Link to={homePath} className="brand" aria-label="简易装首页" onClick={closeMenus}>
      <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 42 42" fill="none"><path d="M5 19 21 5l16 14v18H25V25h-8v12H5Z" fill="#168be8" /><path d="m12 19 9-8 9 8M21 11v10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span><span className="brand-name">简易装</span>
    </Link>
    <nav className="main-nav" id="jyz-main-navigation" aria-label={isBusiness ? '企业工作区导航' : '主导航'}>
      {isBusiness ? businessItems.map(renderLink) : <>{renderLink({ path: '/', label: '首页' })}{renderDropdown('creation', 'AI创作', creationItems)}{renderLink({ path: '/projects', label: '我的项目' })}{renderLink({ path: '/inspiration', label: '灵感广场' })}{renderDropdown('resources', '资源中心', resourceItems)}<Link to="/subscription" className="pill-nav-item mobile-nav-action" onClick={closeMenus}><img className="membership-icon" src="/reference-design/header/membership.svg" alt="" />开通会员</Link></>}
    </nav>
    <div className="header-actions">
      <button className="theme-toggle" type="button" aria-label={theme === 'dark' ? '切换至太阳亮色主题' : '切换至月亮深色主题'} aria-pressed={theme === 'dark'} title="切换黑白主题" onClick={(event) => { void toggleReferenceTheme(event.currentTarget); }}><span className="theme-icon-frame" aria-hidden="true"><img className="theme-icon theme-icon-sun" src="/reference-design/header/sun.svg" alt="" /><img className="theme-icon theme-icon-moon" src="/reference-design/header/moon.svg" alt="" /></span></button>
      {!isBusiness && <Link to="/subscription" className="header-pill-action pill-animated subscription-action" onClick={closeMenus}><PillLabel><img className="membership-icon" src="/reference-design/header/membership.svg" alt="" />开通会员</PillLabel></Link>}
      {authSession ? <div className={`account-menu${openMenu === 'account' ? ' is-open' : ''}`}>
        <button type="button" className="header-pill-action pill-animated auth-action" aria-label={`${displayName}，打开账户菜单`} aria-expanded={openMenu === 'account'} aria-controls="jyz-account-popover" onClick={(event) => toggleMenu('account', event.currentTarget)}><PillLabel><span className="account-button-name">{displayName}</span></PillLabel></button>
        <div className="account-popover" id="jyz-account-popover" hidden={openMenu !== 'account'}>
          <div className="account-summary"><span className="account-avatar">{navProfile?.avatar ? <img src={navProfile.avatar} alt="" /> : displayName.slice(0, 1)}</span><div className="account-identity"><strong>{displayName}</strong><span>{isBusiness ? '企业账号' : '个人账号'}</span></div></div>
          <div className="account-actions-list"><Link className="account-action" to={notificationPath} onClick={closeMenus}><Bell />通知中心<span className="account-action-arrow">›</span></Link><Link className="account-action" to={isBusiness ? '/business?tab=overview' : '/profile'} onClick={closeMenus}><UserRound />{isBusiness ? '企业信息' : '个人中心'}<span className="account-action-arrow">›</span></Link>{!isBusiness && <Link className="account-action" to="/subscription" onClick={closeMenus}><Crown />积分与订阅<span className="account-action-arrow">›</span></Link>}<Link className="account-action" to={isBusiness ? '/business?tab=overview' : '/projects'} onClick={closeMenus}>{isBusiness ? <LayoutDashboard /> : <FolderOpen />}{isBusiness ? '企业概览' : '我的项目'}<span className="account-action-arrow">›</span></Link></div>
          <button type="button" className="account-action account-logout" onClick={() => { signOut(); closeMenus(); navigate('/', { replace: true }); }}><LogOut />退出登录</button>
        </div>
      </div> : <Link to={`/login?next=${encodeURIComponent(routeKey)}`} className="header-pill-action pill-animated auth-action" onClick={closeMenus}><PillLabel>登录 / 注册</PillLabel></Link>}
      <button ref={mobileTriggerRef} className="mobile-nav-toggle" type="button" aria-label={mobileOpen ? '关闭导航' : '打开导航'} aria-expanded={mobileOpen} aria-controls="jyz-main-navigation" onClick={() => { setMobileOpen((open) => !open); setOpenMenu(null); }}>{mobileOpen ? <X /> : <Menu />}</button>
    </div>
  </header>;
}
