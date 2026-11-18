import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authRequest, type AuthSession } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminLoginPage.css';

export default function ResellerLoginPage() {
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
      const session = await authRequest<AuthSession>('/api/v1/auth/login', { email, password, accountType: 'PERSONAL' });
      if (session.user.role !== 'RESELLER_ADMIN') throw new Error('该账号没有代理后台权限。');
      setAuthSession(session);
      const next = new URLSearchParams(location.search).get('next');
      navigate(next?.startsWith('/reseller') ? next : '/reseller', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '登录失败，请检查代理账号凭据。');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="admin-login-page">
      <div className="admin-login-grid" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <section className="admin-login-shell">
        <div className="admin-login-brand"><span className="admin-login-mark">简</span><span><strong>简艺装</strong><small>PARTNER PORTAL</small></span></div>
        <div className="admin-login-kicker"><i /> PARTNER ACCESS / 01</div>
        <h1>代理服务平台</h1>
        <p className="admin-login-lead">代理账号由平台创建，用于查看已分配企业的订阅与使用情况。</p>
        <form className="admin-login-form" onSubmit={submit}>
          <label>登录邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="partner@company.com" required maxLength={320} /></label>
          <label>访问密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="输入代理账号密码" required maxLength={128} /></label>
          {error && <p className="admin-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={pending}><span>{pending ? '正在验证' : '进入代理工作台'}</span><b>↗</b></button>
        </form>
        <div className="admin-login-foot"><span>代理企业数据由平台分配</span><button type="button" onClick={() => navigate('/login')}>返回用户登录</button></div>
      </section>
      <aside className="admin-login-aside"><span className="admin-login-aside-label">JIAN YI ZHUANG / PARTNER</span><strong>服务每一家<br /><em>值得信赖的企业。</em></strong><div className="admin-login-aside-line"><span /> <small>PARTNER OPERATIONS</small></div></aside>
    </main>
  );
}
