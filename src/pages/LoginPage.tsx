import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authRequest, createLocalDemoSession, type AccountType, type AuthSession } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import heroImage from '../assets/generated/hero-home.png';
import './LoginPage.css';

type FormMode = 'login' | 'register';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuthSession = useAppStore((state) => state.setAuthSession);
  const [mode, setMode] = useState<FormMode>('login');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const session = mode === 'login'
        ? await authRequest<AuthSession>('/api/v1/auth/login', { email, password, accountType: accountType.toUpperCase() })
        : await authRequest<AuthSession>('/api/v1/auth/register', { email, password, displayName, accountType, companyName: accountType === 'business' ? companyName : undefined });
      setAuthSession(session);
      const next = new URLSearchParams(location.search).get('next');
      const safeNext = next?.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : null;
      navigate(safeNext || (session.user.role === 'PLATFORM_ADMIN' ? '/admin' : session.user.accountType === 'business' ? '/business' : '/'), { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  function enterLocalDemo() {
    const session = createLocalDemoSession();
    if (!session) return;
    setAuthSession(session);
    const next = new URLSearchParams(location.search).get('next');
    const safeNext = next?.startsWith('/') && !next.startsWith('//') && next !== '/login' ? next : '/canvas';
    navigate(safeNext, { replace: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="简艺装空间灵感">
        <img src={heroImage} alt="明亮自然的家居空间" />
        <div className="auth-visual-shade" />
        <div className="auth-visual-copy">
          <span className="auth-kicker">JIAN YI ZHUANG · HOME STUDIO</span>
          <h1>把想象，落成一处好住的家。</h1>
          <p>从一张照片开始，保存每一次灵感，也让团队协作更清楚。</p>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-brand"><span className="auth-brand-mark">简</span><span><strong>简艺装</strong><small>DESIGN WITH EASE</small></span></div>
        <div className="auth-heading">
          <span className="auth-kicker">WELCOME BACK</span>
          <h2>{mode === 'login' ? '进入你的设计空间' : '创建你的设计空间'}</h2>
          <p>{mode === 'login' ? '登录后继续你的项目与灵感。' : '选择使用方式，马上开始整理装修灵感。'}</p>
        </div>

        <div className="auth-mode-tabs" role="tablist" aria-label="账号类型">
          <button type="button" className={accountType === 'personal' ? 'active' : ''} onClick={() => setAccountType('personal')} role="tab" aria-selected={accountType === 'personal'}>个人使用</button>
          <button type="button" className={accountType === 'business' ? 'active' : ''} onClick={() => setAccountType('business')} role="tab" aria-selected={accountType === 'business'}>企业团队</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <label>称呼<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={accountType === 'business' ? '你的姓名' : '怎么称呼你'} required maxLength={120} /></label>}
          {mode === 'register' && accountType === 'business' && <label>企业名称<input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="例如：简艺装设计事务所" required maxLength={160} /></label>}
          <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" autoComplete="email" required maxLength={320} /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? '至少 8 位字符' : '输入密码'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={pending}>{pending ? '正在处理…' : mode === 'login' ? '登录' : '创建账号'}</button>
        </form>

        <button className="auth-toggle" type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '还没有账号？创建一个' : '已有账号？返回登录'}</button>
        {mode === 'login' && import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname) && <div className="auth-demo-entry"><p>本地演示账号：demo@local.test</p><small>仅使用当前浏览器数据，不连接服务端账号。</small><button type="button" onClick={enterLocalDemo}>本地演示进入</button></div>}
        <p className="auth-note">企业账号用于团队资料、案例与报价协作；个人账号用于独立设计与项目保存。</p>
      </section>
    </main>
  );
}
