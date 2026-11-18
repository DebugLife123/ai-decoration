import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import { grantTestCredits, loadAdminCreditUsers, type AdminCreditUser } from '../services/credits';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminCreditsPage.css';

export default function AdminCreditsPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [users, setUsers] = useState<AdminCreditUser[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdminCreditUser | null>(null);
  const [units, setUnits] = useState('1000');
  const [note, setNote] = useState('管理员发放测试积分');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = async (search = query) => {
    setLoading(true); setError('');
    try { const result = await loadAdminCreditUsers(search); setUsers(result); setSelected((current) => result.find((item) => item.userId === current?.userId) || result[0] || null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '用户积分读取失败。'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void Promise.resolve().then(() => load('')); }, []);
  const grant = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return;
    const amount = Number(units);
    if (!Number.isInteger(amount) || amount < 1) { setError('请输入大于 0 的整数积分。'); return; }
    setBusy(true); setError(''); setNotice('');
    try { const result = await grantTestCredits(selected.userId, amount, note); setNotice(`已向 ${selected.email} 发放 ${amount} 积分。`); setUsers((current) => current.map((item) => item.userId === selected.userId ? { ...item, balance: result.account.balance, updatedAt: result.account.updatedAt } : item)); setSelected((current) => current ? { ...current, balance: result.account.balance, updatedAt: result.account.updatedAt } : null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '测试积分发放失败。'); }
    finally { setBusy(false); }
  };
  const logout = () => { signOut(); navigate('/login', { replace: true }); };

  return <div className="admin-page"><AdminSidebar /><div className="admin-stage"><AdminTopbar title="积分管理" onLogout={logout} /><main className="admin-content admin-credits-content">
    <div className="admin-heading"><div><span className="admin-kicker">CONSUMER / CREDITS</span><h1>用户积分管理</h1></div></div>
    <form className="admin-credits-search" onSubmit={(event) => { event.preventDefault(); void load(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户邮箱或昵称" /><button type="submit" disabled={loading}>{loading ? '查询中' : '搜索'}</button></form>
    {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-credits-notice">{notice}</div>}
    <section className="admin-credits-layout"><div className="admin-credit-users">{loading ? <div className="admin-empty">正在读取用户…</div> : users.length === 0 ? <div className="admin-empty">没有匹配的个人用户。</div> : users.map((user) => <button type="button" className={selected?.userId === user.userId ? 'selected' : ''} key={user.userId} onClick={() => setSelected(user)}><span><strong>{user.displayName}</strong><small>{user.email}</small></span><b>{user.balance}<small>积分</small></b></button>)}</div><form className="admin-credit-grant" onSubmit={grant}><span className="admin-kicker">MANUAL GRANT</span><h2>发放测试积分</h2>{selected ? <><div className="admin-credit-selected"><small>当前用户</small><strong>{selected.email}</strong><span>余额 {selected.balance} 积分</span></div><label>发放数量<input type="number" min="1" step="1" value={units} onChange={(event) => setUnits(event.target.value)} /></label><label>流水说明<input value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} /></label><button type="submit" disabled={busy}>{busy ? '发放中…' : '确认发放'}</button></> : <div className="admin-empty">请先选择用户。</div>}</form></section>
  </main></div></div>;
}
