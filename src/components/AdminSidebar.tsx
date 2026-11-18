import { Link, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

type IconName = 'building' | 'file' | 'shield' | 'partner' | 'orders' | 'budget' | 'assets' | 'audit' | 'spark' | 'settings';

interface AdminNavItem {
  path: string;
  paths?: string[];
  label: string;
  description: string;
  icon: IconName;
}

const navItems: AdminNavItem[] = [
  { path: '/admin/accounts', label: '账号管理', description: '个人用户与企业账号', icon: 'partner' },
  { path: '/admin', label: '企业认证', description: '准入审核队列', icon: 'building' },
  { path: '/admin/marketplace', paths: ['/admin/marketplace', '/admin/assets', '/admin/style-materials'], label: '企业内容', description: '企业资料、报价与图片', icon: 'building' },
  { path: '/admin/inspiration', label: '灵感投稿', description: '用户方案与企业模板审核', icon: 'spark' },
  { path: '/admin/resellers', paths: ['/admin/resellers', '/admin/subscription-orders'], label: 'SaaS运营', description: '代理账号与订阅订单', icon: 'partner' },
  { path: '/admin/budget-settings', label: '风格与预算', description: '生图提示词与预算规则', icon: 'budget' },
  { path: '/admin/credits', label: '积分管理', description: '测试积分与用户余额', icon: 'budget' },
  { path: '/admin/audit', label: '操作日志', description: '管理员操作记录', icon: 'audit' },
  { path: '/admin/platform-contact', label: '平台设置', description: '管理员联系方式', icon: 'settings' },
];

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    building: <><path d="M4 20V8h16v12M2 20h20M7 8V5h10v3M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h8M8 17h5" /></>,
    shield: <path d="M12 3 20 6v5c0 5-3.4 8.8-8 10-4.6-1.2-8-5-8-10V6l8-3Z" />,
    partner: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.4-3.1 2.2-5 5.5-5s5.1 1.9 5.5 5M14 14.5c2.8.1 4.4 1.5 4.7 4.5" /></>,
    orders: <><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4" /></>,
    budget: <><path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16V4" /></>,
    assets: <><rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="9" cy="9" r="1.4" /><path d="m5 17 4-4 3 3 3-4 4 5" /></>,
    audit: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10 10.2 8.2 12 3Z" /><path d="M19 16v5M16.5 18.5h5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function isCurrent(pathname: string, item: AdminNavItem) {
  const paths = item.paths || [item.path];
  return paths.some((path) => path === '/admin' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`));
}

export default function AdminSidebar() {
  const { pathname } = useLocation();
  return <aside className="admin-rail">
    <div className="admin-brand"><span className="admin-brand-mark"><Icon name="shield" /></span><span><strong>简艺装</strong><small>CONTROL ROOM</small></span></div>
    <div className="admin-rail-label">平台治理</div>
    {navItems.map((item) => {
      const current = isCurrent(pathname, item);
      return <Link key={item.path} className={current ? 'admin-rail-current' : 'admin-rail-link'} aria-current={current ? 'page' : undefined} to={item.path}><span className="admin-rail-icon"><Icon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span></Link>;
    })}
    <div className="admin-rail-footer"><i />运行正常<span>INTERNAL CONSOLE</span></div>
  </aside>;
}
