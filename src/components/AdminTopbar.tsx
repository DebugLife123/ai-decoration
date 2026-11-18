import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAdminNotificationCount } from '../hooks/useAdminNotificationCount';

interface AdminTopbarProps {
  title: string;
  onLogout: () => void;
  parent?: ReactNode;
}

function LogoutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>;
}

function NotificationIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

export default function AdminTopbar({ title, onLogout, parent }: AdminTopbarProps) {
  const unreadCount = useAdminNotificationCount();
  return <header className="admin-topbar">
    <div className="admin-breadcrumb">{parent ? <>{parent}<b>/</b></> : <><span>平台治理</span><b>/</b></>}<strong>{title}</strong></div>
    <div className="admin-topbar-actions"><Link className="admin-icon-button admin-notification-button" to="/admin/notifications" title="通知中心" aria-label={unreadCount > 0 ? `通知中心，${unreadCount} 条未读通知` : '通知中心'}><NotificationIcon />{unreadCount > 0 && <span aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</Link><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={onLogout} title="退出登录" aria-label="退出登录"><LogoutIcon /></button></div>
  </header>;
}
