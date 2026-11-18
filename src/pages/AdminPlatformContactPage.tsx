import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';

type ContactDraft = { contactName: string; phone: string; email: string; wechat: string; message: string };
type ContactSettings = ContactDraft & { updatedAt: string };
const empty: ContactDraft = { contactName: '', phone: '', email: '', wechat: '', message: '账号已停用或删除，请联系平台管理员。' };

function toContactDraft(settings: ContactDraft): ContactDraft {
  return {
    contactName: settings.contactName,
    phone: settings.phone,
    email: settings.email,
    wechat: settings.wechat,
    message: settings.message,
  };
}

export default function AdminPlatformContactPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [draft, setDraft] = useState<ContactDraft>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<ContactSettings>('/api/v1/admin/platform-contact')
      .then((settings) => { if (active) { setDraft(toContactDraft(settings)); setLoaded(true); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '联系方式加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const updated = await apiRequest<ContactSettings>('/api/v1/admin/platform-contact', { method: 'PUT', body: JSON.stringify(toContactDraft(draft)) });
      setDraft(toContactDraft(updated)); setNotice('管理员联系方式已保存。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请稍后重试。'); }
    finally { setSaving(false); }
  }

  return <div className="admin-page"><AdminSidebar /><div className="admin-stage"><AdminTopbar title="平台设置" onLogout={() => { signOut(); navigate('/admin/login', { replace: true }); }} /><main className="admin-content admin-contact-content">
    <div className="admin-heading"><div><span className="admin-kicker">PLATFORM / CONTACT</span><h1>管理员联系方式</h1><p>用户账号停用或删除后，登录页会显示这里填写的联系方式。</p></div></div>
    {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-contact-success" role="status">{notice}</div>}
    <section className="admin-contact-panel"><header><div><span className="admin-kicker">ACCOUNT SUPPORT</span><h2>账号问题联系信息</h2></div><span className="admin-contact-state">{loading ? '读取中' : '公开展示'}</span></header>
      {loading ? <div className="admin-contact-loading">正在读取平台设置…</div> : !loaded ? <div className="admin-contact-loading">读取失败，请刷新页面重试。</div> : <form onSubmit={(event) => void save(event)}>
        <fieldset className="admin-contact-form" disabled={saving}>
          <label>管理员 / 平台名称<input maxLength={120} value={draft.contactName} onChange={(event) => setDraft({ ...draft, contactName: event.target.value })} placeholder="例如：简艺装平台服务中心" /></label>
          <label>联系电话<input maxLength={80} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="用户可拨打的联系电话" /></label>
          <label>联系邮箱<input type="email" maxLength={320} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="support@example.com" /></label>
          <label>微信号<input maxLength={120} value={draft.wechat} onChange={(event) => setDraft({ ...draft, wechat: event.target.value })} placeholder="平台服务微信" /></label>
          <label className="admin-contact-message">停用账号提示<textarea maxLength={500} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label>
        </fieldset>
        <footer><p>仅已填写的联系方式会展示在普通登录页和管理员登录页。</p><button type="submit" disabled={saving}>{saving ? '保存中…' : '保存设置'}</button></footer>
      </form>}
    </section>
    <section className="admin-contact-preview" aria-label="登录页展示预览">
      <header><div><span className="admin-kicker">LOGIN PREVIEW</span><h2>停用账号提示预览</h2></div><span className="admin-contact-preview-note">实时预览未保存内容</span></header>
      <div className="admin-contact-preview-error"><strong>{draft.message || '账号已停用或删除，请联系平台管理员。'}</strong><dl>
        {draft.contactName && <div><dt>管理员</dt><dd>{draft.contactName}</dd></div>}
        {draft.phone && <div><dt>电话</dt><dd>{draft.phone}</dd></div>}
        {draft.email && <div><dt>邮箱</dt><dd>{draft.email}</dd></div>}
        {draft.wechat && <div><dt>微信</dt><dd>{draft.wechat}</dd></div>}
      </dl></div>
    </section>
  </main></div></div>;
}
