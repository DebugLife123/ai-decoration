import { NavLink } from 'react-router-dom';
import './AdminWorkspaceTabs.css';

type WorkspaceGroup = 'content' | 'saas';

const tabs: Record<WorkspaceGroup, { path: string; label: string }[]> = {
  content: [
    { path: '/admin/marketplace', label: '企业与材料' },
    { path: '/admin/assets', label: '未关联图片' },
    { path: '/admin/style-materials', label: '风格素材' },
  ],
  saas: [
    { path: '/admin/resellers', label: '代理管理' },
    { path: '/admin/subscription-orders', label: '订阅订单' },
  ],
};

export default function AdminWorkspaceTabs({ group }: { group: WorkspaceGroup }) {
  return <nav className="admin-workspace-tabs" aria-label={group === 'content' ? '企业内容管理' : 'SaaS运营管理'}>
    {tabs[group].map((tab) => <NavLink key={tab.path} to={tab.path} className={({ isActive }) => isActive ? 'active' : undefined}>{tab.label}</NavLink>)}
  </nav>;
}
