import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { markAllNotificationsRead, markNotificationRead, loadNotifications, type AppNotification, type NotificationType } from '../services/notifications';
import { useAppStore } from '../stores/appStore';
import './NotificationsPage.css';

const typeLabels: Record<NotificationType, string> = {
  CERTIFICATION: '认证结果',
  QUOTE_EXPIRING: '报价提醒',
  INQUIRY: '用户咨询',
  ADMIN_REVIEW: '审核待办',
};

const typeMarks: Record<NotificationType, string> = {
  CERTIFICATION: '✓',
  QUOTE_EXPIRING: '!',
  INQUIRY: '↗',
  ADMIN_REVIEW: '⌁',
};

function dateLabel(value: string | null) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function NotificationsPage() {
  const role = useAppStore((state) => state.role);
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const isAdmin = role === 'admin';
  const visible = useMemo(() => filter === 'UNREAD' ? items.filter((item) => !item.read) : items, [filter, items]);
  const unreadCount = items.filter((item) => !item.read).length;

  const refresh = () => {
    setStatus('loading'); setError('');
    void loadNotifications().then((next) => { setItems(next); setStatus('ready'); }).catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : '通知加载失败。'); setStatus('error'); });
  };
  useEffect(() => { void Promise.resolve().then(refresh); }, []);

  const openNotification = async (item: AppNotification) => {
    if (!item.read) {
      setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, read: true } : entry));
      void markNotificationRead(item.key).catch(() => undefined);
    }
    navigate(item.link || (isAdmin ? '/admin' : role === 'business' ? '/business' : '/'));
  };
  const readAll = async () => {
    if (!unreadCount) return;
    setItems((current) => current.map((item) => ({ ...item, read: true })));
    await markAllNotificationsRead().catch(() => refresh());
  };

  const title = isAdmin ? '审核通知' : role === 'business' ? '企业通知' : '通知中心';
  const detail = isAdmin ? '认证申请进入后会在这里提醒你处理。' : role === 'business' ? '认证、报价和客户咨询的最新状态都集中在这里。' : '查看与你相关的服务动态。';
  return <main className={`notifications-page ${isAdmin ? 'notifications-admin' : ''}`}>
    <header className="notifications-header"><div><span className="notifications-eyebrow">NOTIFICATION CENTER</span><h1>{title}</h1><p>{detail}</p></div><div className="notifications-header-actions"><button type="button" onClick={refresh} disabled={status === 'loading'} aria-label="刷新通知">{status === 'loading' ? '同步中' : '刷新'}</button>{unreadCount > 0 && <button type="button" className="notifications-read-all" onClick={() => void readAll()}>全部标为已读</button>}</div></header>
    <div className="notifications-toolbar"><div className="notifications-tabs"><button type="button" className={filter === 'ALL' ? 'active' : ''} onClick={() => setFilter('ALL')}>全部 <span>{items.length}</span></button><button type="button" className={filter === 'UNREAD' ? 'active' : ''} onClick={() => setFilter('UNREAD')}>未读 <span>{unreadCount}</span></button></div>{!isAdmin && <Link to={role === 'business' ? '/business' : '/'}>返回工作区</Link>}</div>
    {error && <div className="notifications-error" role="alert">{error}</div>}
    {status === 'loading' ? <section className="notifications-empty"><strong>正在读取通知</strong><span>请稍候。</span></section> : visible.length === 0 ? <section className="notifications-empty"><div className="notifications-empty-mark">✓</div><strong>{filter === 'UNREAD' ? '没有未读通知' : '暂时没有通知'}</strong><span>{filter === 'UNREAD' ? '新的动态会在这里提醒你。' : detail}</span></section> : <section className="notifications-list" aria-label="通知列表">{visible.map((item) => <button type="button" key={item.key} className={`notification-item ${item.read ? 'read' : 'unread'}`} onClick={() => void openNotification(item)}><span className={`notification-mark ${item.type.toLowerCase()}`}>{typeMarks[item.type]}</span><span className="notification-copy"><span className="notification-type">{typeLabels[item.type]} · {dateLabel(item.createdAt)}</span><strong>{item.title}</strong><span>{item.message}</span></span><span className="notification-arrow">›</span></button>)}</section>}
  </main>;
}
