import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authRequest, type AuthSession } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminLoginPage.css';

function ShieldMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 20 6v5c0 5-3.4 8.8-8 10-4.6-1.2-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></svg>;
}

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthSession = useAppStore((state) => state.setAuthSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const session = await authRequest<AuthSession>('/api/v1/auth/admin/login', { email, password, accountType: 'PERSONAL' });
      if (session.user.role !== 'PLATFORM_ADMIN') throw new Error('该账号没有管理员权限。');
      setAuthSession(session);
      const next = new URLSearchParams(location.search).get('next');
      navigate(next?.startsWith('/admin') ? next : '/admin', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '登录失败，请检查管理员凭据。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <section className="admin-login-shell">
        <div className="admin-login-brand"><span className="admin-login-mark"><ShieldMark /></span><span><strong>简艺装</strong><small>CONTROL ROOM</small></span></div>
        <div className="admin-login-kicker"><i /> INTERNAL ACCESS / 01</div>
        <h1>平台管理入口</h1>
        <p className="admin-login-lead">仅限平台管理员使用。企业和个人账号请返回用户端登录。</p>
        <form className="admin-login-form" onSubmit={submit}>
          <label>管理员邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="admin@company.com" required maxLength={320} /></label>
          <label>访问密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="输入管理员密码" required maxLength={128} /></label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={pending}><span>{pending ? '正在验证' : '进入控制台'}</span><b>↗</b></button>
        </form>
        <div className="admin-login-foot"><span><ShieldMark /> 管理员账号由平台运维创建</span><button type="button" onClick={() => navigate('/login')}>返回普通登录</button></div>
      </section>
      <aside className="admin-login-aside"><span className="admin-login-aside-label">JIAN YI ZHUANG / ADMIN</span><strong>审核每一个<br /><em>值得信任的团队。</em></strong><div className="admin-login-aside-line"><span /> <small>SECURE OPERATIONS</small></div></aside>
    </main>
  );
}
