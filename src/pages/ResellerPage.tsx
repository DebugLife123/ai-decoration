import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './ResellerPage.css';

interface ResellerCompany {
  companyId: string;
  companyName: string;
  accountEmail: string | null;
  certificationStatus: string;
  planName: string | null;
  subscriptionStatus: string | null;
  expiresAt: string | null;
  materialCount: number;
  materialLimit: number;
  caseCount: number;
  caseLimit: number;
  generationUsed: number;
  generationQuota: number;
  assignedAt: string;
}

interface ResellerDashboard {
  reseller: { code: string; name: string; contactName: string | null; loginEmail: string; status: string; createdAt: string };
  companyCount: number;
  activeSubscriptionCount: number;
  expiredSubscriptionCount: number;
  companies: ResellerCompany[];
}

const certificationLabels: Record<string, string> = { APPROVED: '已认证', PENDING: '审核中', REJECTED: '未通过', NOT_SUBMITTED: '未提交' };
const subscriptionLabels: Record<string, string> = { ACTIVE: '有效', TRIALING: '试用中', GRACE_PERIOD: '宽限期', PAST_DUE: '待续费', EXPIRED: '已过期', CANCELLED: '已取消' };

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '未开通';
}

export default function ResellerPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [dashboard, setDashboard] = useState<ResellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(refresh = false) {
    if (refresh) {
      setLoading(true);
      setError('');
    }
    try { setDashboard(await apiRequest<ResellerDashboard>('/api/v1/reseller/dashboard')); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '代理数据加载失败。'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void Promise.resolve().then(() => load()); }, []);

  function logout() { signOut(); navigate('/reseller/login', { replace: true }); }

  return <div className="reseller-page">
    <aside className="reseller-rail">
      <a className="reseller-brand" href="/reseller"><span>简</span><strong>简艺装<small>PARTNER PORTAL</small></strong></a>
      <div className="reseller-nav-label">代理服务</div>
      <div className="reseller-nav-active"><span>▦</span><div><strong>企业总览</strong><small>订阅与使用情况</small></div></div>
      <div className="reseller-rail-foot"><i />代理服务正常</div>
    </aside>
    <main className="reseller-main">
      <header className="reseller-topbar"><div><span>代理服务</span><b>/</b><strong>企业总览</strong></div><div className="reseller-user"><span>{dashboard?.reseller.name || '代理工作台'}</span><button type="button" onClick={logout} aria-label="退出登录" title="退出登录">↗</button></div></header>
      <section className="reseller-content">
        <div className="reseller-heading"><div><small>PARTNER OVERVIEW</small><h1>{dashboard?.reseller.name || '企业总览'}</h1><p>{dashboard?.reseller.loginEmail || '查看已分配企业的订阅状态与套餐使用量。'}</p></div><button type="button" onClick={() => void load(true)} disabled={loading}>{loading ? '同步中…' : '刷新'}</button></div>
        {error && <div className="reseller-error" role="alert">{error}</div>}
        <section className="reseller-stats" aria-label="代理企业统计">
          <div><small>分配企业</small><strong>{loading ? '—' : dashboard?.companyCount ?? 0}</strong><span>当前代理名下</span></div>
          <div><small>有效订阅</small><strong>{loading ? '—' : dashboard?.activeSubscriptionCount ?? 0}</strong><span>有效或试用中</span></div>
          <div><small>已过期 / 未开通</small><strong>{loading ? '—' : dashboard?.expiredSubscriptionCount ?? 0}</strong><span>需要跟进</span></div>
        </section>
        <section className="reseller-table-section">
          <div className="reseller-section-heading"><div><small>ASSIGNED ACCOUNTS</small><h2>名下企业</h2></div><span>{dashboard?.companies.length ?? 0} 家</span></div>
          {loading ? <div className="reseller-empty">正在加载企业资料…</div> : !dashboard?.companies.length ? <div className="reseller-empty">暂未分配企业</div> : <div className="reseller-table-wrap"><table><thead><tr><th>企业</th><th>认证状态</th><th>订阅方案</th><th>订阅状态</th><th>到期日</th><th>材料 / 案例</th><th>AI 生成用量</th></tr></thead><tbody>{dashboard.companies.map((company) => <tr key={company.companyId}><td><strong>{company.companyName}</strong><small>{company.accountEmail || '未登记账号邮箱'}</small></td><td><span className={`reseller-tag ${company.certificationStatus === 'APPROVED' ? 'success' : ''}`}>{certificationLabels[company.certificationStatus] || company.certificationStatus}</span></td><td>{company.planName || '未开通'}</td><td><span className={`reseller-tag ${company.subscriptionStatus === 'ACTIVE' || company.subscriptionStatus === 'TRIALING' ? 'success' : ''}`}>{subscriptionLabels[company.subscriptionStatus || ''] || '未开通'}</span></td><td>{date(company.expiresAt)}</td><td><span>{company.materialCount} / {company.materialLimit}</span><small>材料　{company.caseCount} / {company.caseLimit} 案例</small></td><td>{company.generationUsed} / {company.generationQuota}</td></tr>)}</tbody></table></div>}
        </section>
      </section>
    </main>
  </div>;
}
