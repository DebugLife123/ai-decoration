import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authRequest, type AccountType, type AuthSession } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import { safeLoginDestination } from '../utils/loginDestination';
import { toggleReferenceTheme, useReferenceTheme } from '../services/referenceTheme';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';
import './LoginPage.css';

type FormMode = 'login' | 'register';

export default function LoginPage() {
  const theme = useReferenceTheme();
  const [visible, setVisible] = useState(false);
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
    if (pending) return;
    setPending(true);
    try {
      const session = mode === 'login'
        ? await authRequest<AuthSession>('/api/v1/auth/login', { email, password, accountType: accountType.toUpperCase() })
        : await authRequest<AuthSession>('/api/v1/auth/register', { email, password, displayName, accountType, companyName: accountType === 'business' ? companyName : undefined });
      setAuthSession(session);
      const next = new URLSearchParams(location.search).get('next');
      const safeNext = safeLoginDestination(next);
      navigate(safeNext || (session.user.role === 'PLATFORM_ADMIN' ? '/admin' : session.user.role === 'RESELLER_ADMIN' ? '/reseller' : session.user.accountType === 'business' ? '/business' : '/'), { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '请求失败，请稍后重试。');
    } finally {
      setPending(false);
    }
  }

  function switchMode(next: FormMode) {
    if (next === mode) return;
    setMode(next); setError(''); setVisible(false); setPassword('');
  }
  const registering = mode === 'register';
  return <div className="reference-login">
    <header className="rl-header">
      <Link to="/" className="rl-home" aria-label="返回简易装首页"><BrandMark />简易装</Link>
      <button type="button" className="rl-theme" aria-label="深色主题" aria-pressed={theme === 'dark'} onClick={(e) => void toggleReferenceTheme(e.currentTarget)}><img src={`/reference-design/header/${theme === 'dark' ? 'moon' : 'sun'}.svg`} alt="" /></button>
    </header>
    <main className="rl-layout"><ModelOrbit />
      <section className="rl-panel" aria-labelledby="rl-heading"><div className="rl-content">
        <p className="rl-eyebrow">ACCOUNT ACCESS</p>
        <h2 id="rl-heading">{registering ? '创建账号' : '欢迎回来'}</h2>
        <p className="rl-intro">{registering ? '注册后即可保存设计项目与创作记录。' : '登录后继续你的设计项目与创作记录。'}</p>
        <div className="rl-modes" role="group" aria-label="登录或注册">
          <button type="button" disabled={pending} aria-pressed={!registering} aria-controls="rl-form" onClick={() => switchMode('login')}>邮箱登录</button>
          <button type="button" disabled={pending} aria-pressed={registering} aria-controls="rl-form" onClick={() => switchMode('register')}>注册账号</button>
        </div>
        <form id="rl-form" aria-label={registering ? '注册账号' : '邮箱登录'} aria-busy={pending} aria-describedby={error ? 'rl-error' : undefined} onSubmit={submit} onChange={() => setError('')}>
          <fieldset className="rl-fields" disabled={pending}>
            <fieldset className="rl-types"><legend>账号类型</legend>
              <label><input type="radio" name="accountType" checked={accountType === 'personal'} onChange={() => setAccountType('personal')} />个人使用</label>
              <label><input type="radio" name="accountType" checked={accountType === 'business'} onChange={() => setAccountType('business')} />企业团队</label>
            </fieldset>
            {registering && <label className="rl-field">称呼<input name="displayName" autoComplete="name" placeholder="怎么称呼你" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required pattern=".*\S.*" maxLength={120} /></label>}
            {registering && accountType === 'business' && <label className="rl-field">企业名称<input name="companyName" autoComplete="organization" placeholder="请输入企业名称" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required pattern=".*\S.*" maxLength={160} /></label>}
            <label className="rl-field">邮箱地址<input name="email" type="email" autoComplete="username" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} /></label>
            <div className="rl-field"><label htmlFor="rl-password">密码</label><div className="rl-password">
              <input id="rl-password" name="password" type={visible ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} placeholder={registering ? '至少 8 位字符' : '请输入密码'} minLength={registering ? 8 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" aria-label="显示密码" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div></div>
            {error && <p id="rl-error" className="rl-error" role="alert">{error}</p>}
            <button className="rl-submit" type="submit" disabled={pending}>{pending ? '正在处理…' : registering ? '创建账号' : '登录'}<ArrowRight size={17} aria-hidden="true" /></button>
          </fieldset>
        </form>
        <div className="rl-foot"><Link to="/admin/login">后台管理入口 <span aria-hidden="true">↗</span></Link></div>
      </div></section>
    </main>
  </div>;
}

const tracks = [['openai', 'claude', 'gemini', 'doubao', 'kimi'], ['deepseek', 'qwen', 'grok', 'hunyuan']];
function BrandMark() {
  return <svg viewBox="0 0 42 42" fill="none" aria-hidden="true"><path d="M5 19 21 5l16 14v18H25V25h-8v12H5Z" fill="#168be8" /><path d="m12 19 9-8 9 8M21 11v10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ModelOrbit() {
  return <section className="rl-visual" aria-labelledby="rl-title"><div className="model-orbit">
    {tracks.map((track, index) => <div key={track[0]} className={`rl-track ${index ? 'rl-inner' : 'rl-outer'}`} aria-hidden="true">
      {track.map((model, i) => <span className="rl-position" key={model} style={{ '--angle': `${i * 360 / track.length + index * 45}deg` } as CSSProperties}>
        <span className="rl-token"><img src={`/reference-design/models/${model}.svg`} alt="" /></span>
      </span>)}
    </div>)}
    <div className="rl-core"><BrandMark /><p>JIAN YI ZHUANG</p><h1 id="rl-title">简易装 <em>AI</em></h1><span>让灵感抵达方案</span></div>
  </div></section>;
}
