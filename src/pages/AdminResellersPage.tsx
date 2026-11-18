import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import AdminWorkspaceTabs from '../components/AdminWorkspaceTabs';
import './AdminResellersPage.css';

interface Reseller { id: string; code: string; name: string; contactName: string | null; contactInfo: string | null; status: string; loginEmail: string | null; companyCount: number; createdAt: string; }
interface AdminCompany { companyId: string; companyName: string; }
const emptyForm = { code: '', name: '', contactName: '', contactInfo: '', loginEmail: '', initialPassword: '' };

export default function AdminResellersPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [items, setItems] = useState<Reseller[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(refresh = false) {
    if (refresh) setLoading(true);
    try {
      const [resellers, availableCompanies] = await Promise.all([
        apiRequest<Reseller[]>('/api/v1/admin/resellers'),
        apiRequest<AdminCompany[]>('/api/v1/admin/resellers/companies'),
      ]);
      setItems(resellers);
      setCompanies(availableCompanies);
    }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : '代理列表加载失败。'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void Promise.resolve().then(() => load()); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await apiRequest<Reseller>('/api/v1/admin/resellers', { method: 'POST', body: JSON.stringify(form) });
      setForm(emptyForm); setNotice('代理账号已创建，可以将登录邮箱和初始密码交付给代理。'); await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '代理创建失败。'); }
    finally { setSaving(false); }
  }

  async function assignCompany(resellerId: string) {
    const companyId = assignmentDrafts[resellerId];
    if (!companyId) return;
    setAssigningId(resellerId); setError(''); setNotice('');
    try {
      await apiRequest(`/api/v1/admin/resellers/${resellerId}/companies/${companyId}`, { method: 'PUT' });
      setNotice('企业已分配给该代理。');
      setAssignmentDrafts((current) => ({ ...current, [resellerId]: '' }));
      await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '企业分配失败。'); }
    finally { setAssigningId(''); }
  }

  function logout() { signOut(); navigate('/admin/login', { replace: true }); }

  return <div className="admin-page admin-resellers-page">
    <AdminSidebar />
    <div className="admin-stage"><AdminTopbar title="代理管理" onLogout={logout} />
      <main className="admin-reseller-content"><div className="admin-heading"><div><span className="admin-kicker">PARTNER OPERATIONS</span><h1>代理管理</h1></div><button className="admin-refresh" type="button" onClick={() => void load(true)} disabled={loading}>{loading ? '同步中…' : '刷新'}</button></div><AdminWorkspaceTabs group="saas" />
        {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-reseller-notice" role="status">{notice}</div>}
        <section className="admin-reseller-layout"><form className="admin-reseller-form" onSubmit={create}><div><span className="admin-kicker">NEW PARTNER</span><h2>创建代理账号</h2><p>登录账号只允许一个代理管理员使用。</p></div>
          <label>代理编码<input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={64} required /></label>
          <label>代理名称<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={160} required /></label>
          <label>联系人<input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} maxLength={120} /></label>
          <label>联系方式<input value={form.contactInfo} onChange={(e) => setForm({ ...form, contactInfo: e.target.value })} maxLength={200} /></label>
          <label>登录邮箱<input type="email" value={form.loginEmail} onChange={(e) => setForm({ ...form, loginEmail: e.target.value })} maxLength={320} required /></label>
          <label>初始密码<input type="password" value={form.initialPassword} onChange={(e) => setForm({ ...form, initialPassword: e.target.value })} minLength={8} maxLength={72} autoComplete="new-password" required /></label>
          <button type="submit" disabled={saving}>{saving ? '创建中…' : '创建代理账号'}</button>
        </form>
        <section className="admin-reseller-list"><header><div><span className="admin-kicker">REGISTERED PARTNERS</span><h2>代理列表</h2></div><span>{items.length} 个代理</span></header>
          {loading ? <div className="admin-empty">正在加载代理列表…</div> : !items.length ? <div className="admin-empty">尚未创建代理账号</div> : <div className="admin-reseller-rows">{items.map((item) => <article key={item.id}><div className="admin-reseller-identity"><strong>{item.name}</strong><small>{item.code} · {item.loginEmail || '未绑定登录账号'}</small><span className={`admin-status ${item.status === 'ACTIVE' ? 'approved' : 'rejected'}`}>{item.status === 'ACTIVE' ? '正常' : '已暂停'}</span></div><div className="admin-reseller-assign"><select aria-label={`选择分配给${item.name}的企业`} value={assignmentDrafts[item.id] || ''} onChange={(event) => setAssignmentDrafts((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">选择企业进行分配</option>{companies.map((company) => <option key={company.companyId} value={company.companyId}>{company.companyName}</option>)}</select><button type="button" disabled={!assignmentDrafts[item.id] || assigningId === item.id} onClick={() => void assignCompany(item.id)}>{assigningId === item.id ? '分配中…' : '分配'}</button></div><b>{item.companyCount} 家企业</b></article>)}</div>}
        </section></section>
      </main>
    </div></div>;
}
