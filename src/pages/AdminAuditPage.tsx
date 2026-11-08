import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminAuditPage.css';

type AuditAction = 'ALL' | 'CERTIFICATION_REVIEW' | 'IMAGE_CLEANUP' | 'MATERIAL_MODERATION';

interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string | null;
  action: Exclude<AuditAction, 'ALL'>;
  targetType: string;
  targetId: string | null;
  description: string;
  createdAt: string;
}

interface AuditPage {
  items: AuditEntry[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

const actionLabels: Record<Exclude<AuditAction, 'ALL'>, string> = {
  CERTIFICATION_REVIEW: '企业认证审核',
  IMAGE_CLEANUP: '图片清理',
  MATERIAL_MODERATION: '材料报价管理',
};

function Icon({ name }: { name: 'shield' | 'refresh' | 'logout' | 'building' | 'file' }) {
  const paths = {
    shield: <path d="M12 3 20 6v5c0 5-3.4 8.8-8 10-4.6-1.2-8-5-8-10V6l8-3Z" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3.9L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 3.9L21 14" /><path d="M21 19v-5h-5" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    building: <><path d="M4 20V8h16v12M2 20h20M7 8V5h10v3M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h8M8 17h5" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function AdminAuditPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [filter, setFilter] = useState<AuditAction>('ALL');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), size: '20' });
      if (filter !== 'ALL') params.set('action', filter);
      setResult(await apiRequest<AuditPage>(`/api/v1/admin/audit-logs?${params}`));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '操作日志读取失败。');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => { void Promise.resolve().then(loadLogs); }, [loadLogs]);

  function logout() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-page">
      <aside className="admin-rail">
        <div className="admin-brand"><span className="admin-brand-mark"><Icon name="shield" /></span><span><strong>简艺装</strong><small>CONTROL ROOM</small></span></div>
        <div className="admin-rail-label">平台治理</div>
        <Link className="admin-rail-link" to="/admin"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业认证</strong><small>准入审核队列</small></span></Link>
        <Link className="admin-rail-link" to="/admin/marketplace"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业与材料</strong><small>企业状态与公开报价</small></span></Link>
        <Link className="admin-rail-link" to="/admin/assets"><span className="admin-rail-icon"><Icon name="file" /></span><span><strong>图片清理</strong><small>未关联图片管理</small></span></Link>
        <Link className="admin-rail-current" aria-current="page" to="/admin/audit"><span className="admin-rail-icon"><Icon name="shield" /></span><span><strong>操作日志</strong><small>管理员操作记录</small></span></Link>
        <div className="admin-rail-footer"><i />运行正常<span>INTERNAL CONSOLE</span></div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar"><div className="admin-breadcrumb"><span>平台治理</span><b>/</b><strong>操作日志</strong></div><div className="admin-topbar-actions"><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={logout} title="退出登录" aria-label="退出登录"><Icon name="logout" /></button></div></header>
        <main className="admin-content">
          <div className="admin-heading"><div><span className="admin-kicker">OPERATIONS / AUDIT</span><h1>管理员操作日志</h1><p>按时间查看认证审核、报价管理和图片清理记录。</p></div><button className="admin-refresh" type="button" onClick={() => void loadLogs()} disabled={loading}><Icon name="refresh" />{loading ? '读取中' : '刷新日志'}</button></div>
          {error && <div className="admin-error" role="alert">{error}</div>}
          <section className="admin-audit-panel">
            <div className="admin-audit-toolbar"><div><span className="admin-kicker">ADMIN ACTIVITY</span><h2>操作记录 <small>{result?.total ?? 0}</small></h2></div><select value={filter} onChange={(event) => { setFilter(event.target.value as AuditAction); setPage(1); }} aria-label="筛选操作类型"><option value="ALL">全部操作</option><option value="CERTIFICATION_REVIEW">企业认证审核</option><option value="MATERIAL_MODERATION">材料报价管理</option><option value="IMAGE_CLEANUP">图片清理</option></select></div>
            {loading ? <div className="admin-empty">正在读取操作记录…</div> : !result?.items.length ? <div className="admin-empty"><Icon name="shield" /><strong>暂无操作记录</strong><span>认证审核、报价管理或图片清理后，记录会显示在这里。</span></div> : <><div className="admin-audit-table-wrap"><table className="admin-audit-table"><thead><tr><th>时间</th><th>操作人</th><th>操作类型</th><th>对象</th><th>结果</th></tr></thead><tbody>{result.items.map((entry) => <tr key={entry.id}><td>{dateLabel(entry.createdAt)}</td><td>{entry.actorEmail || entry.actorId}</td><td><span className={`admin-audit-action ${entry.action.toLowerCase()}`}>{actionLabels[entry.action]}</span></td><td><span>{entry.targetType === 'COMPANY' ? '企业' : entry.targetType === 'MATERIAL_QUOTE' ? '材料报价' : '企业图片'}</span><small>{entry.targetId || '批量操作'}</small></td><td>{entry.description}</td></tr>)}</tbody></table></div><div className="admin-assets-pagination"><span>第 {result.page} / {Math.max(1, result.totalPages)} 页 · 共 {result.total} 条记录</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button><button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= result.totalPages}>下一页</button></div></div></>}
          </section>
        </main>
      </div>
    </div>
  );
}
