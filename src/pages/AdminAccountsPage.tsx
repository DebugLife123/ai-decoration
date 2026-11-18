import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import { createAccount, deleteAccount, getAccount, listAccounts, setAccountStatus, updateAccount, type AccountDetail, type AccountPage, type ManagedAccount, type ManagedAccountType } from '../services/adminAccounts';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminAccountsPage.css';

type Modal = { kind: 'create' } | { kind: 'edit' | 'status' | 'delete'; account: ManagedAccount } | { kind: 'detail'; id: string };
const certificationLabels: Record<string, string> = { NOT_SUBMITTED: '未提交认证', PENDING: '待审核', APPROVED: '已认证', REJECTED: '未通过' };
const submissionLabels: Record<string, string> = { PENDING: '审核中', APPROVED: '已发布', REJECTED: '已驳回' };
const creditLabels: Record<string, string> = { ADMIN_GRANT: '管理员发放', GENERATION_RESERVE: '生图预扣', GENERATION_REFUND: '生图退款' };
const blankDraft = { email: '', displayName: '', companyName: '', password: '' };
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未登录'; }

function AccountDialog({ title, busy, onClose, children, wide = false }: { title: string; busy: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`account-dialog${wide ? ' account-dialog-wide' : ''}`} aria-labelledby="account-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2 id="account-dialog-title">{title}</h2><button type="button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}>×</button></header>
    {children}
  </dialog>;
}

export default function AdminAccountsPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [type, setType] = useState<ManagedAccountType>('PERSONAL');
  const [filters, setFilters] = useState({ status: 'ALL', query: '', page: 1 });
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AccountPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const next = await listAccounts({ type, ...filters });
      if (version !== requestVersion.current) return;
      if (next.items.length === 0 && next.page > 1) { setFilters((current) => ({ ...current, page: Math.max(1, next.totalPages) })); return; }
      setResult(next);
    } catch (reason) { if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : '账号列表加载失败'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [type, filters]);
  useEffect(() => { let active = true; void Promise.resolve().then(() => { if (active) return load(); }); return () => { active = false; requestVersion.current += 1; }; }, [load]);

  useEffect(() => {
    if (modal?.kind !== 'detail') return;
    let active = true;
    void getAccount(modal.id).then((next) => { if (active) setDetail(next); })
      .catch((reason: unknown) => { if (active) setModalError(reason instanceof Error ? reason.message : '账号详情加载失败'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [modal]);

  function open(next: Modal) {
    setModalError(''); setDetail(null);
    setDetailLoading(next.kind === 'detail');
    if (next.kind === 'edit') setDraft({ email: next.account.email, displayName: next.account.displayName, companyName: next.account.companyName || '', password: '' });
    else setDraft(blankDraft);
    setModal(next);
  }
  function changeType(next: ManagedAccountType) { setType(next); setFilters({ status: 'ALL', query: '', page: 1 }); setQuery(''); setResult(null); setNotice(''); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (modal?.kind !== 'edit' && modal?.kind !== 'create') return;
    setBusy(true); setModalError('');
    try {
      const input = { email: draft.email.trim(), displayName: draft.displayName.trim(), companyName: draft.companyName.trim() };
      if (modal.kind === 'create') await createAccount({ ...input, accountType: type, password: draft.password });
      else await updateAccount(modal.account.id, input);
      setNotice(modal.kind === 'create' ? '账号已创建，可使用设置的邮箱和初始密码登录。' : '账号资料已保存。');
      setModal(null); await load();
    } catch (reason) { setModalError(reason instanceof Error ? reason.message : '账号保存失败'); }
    finally { setBusy(false); }
  }
  async function confirmAction() {
    if (modal?.kind !== 'status' && modal?.kind !== 'delete') return;
    setBusy(true); setModalError('');
    try {
      if (modal.kind === 'delete') { await deleteAccount(modal.account.id); setNotice('账号已删除，已退出全部会话，业务历史已保留。'); }
      else { const next = modal.account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'; await setAccountStatus(modal.account.id, next); setNotice(next === 'ACTIVE' ? '账号已启用，用户可重新登录。' : '账号已停用，已退出全部登录会话。'); }
      setModal(null); await load();
    } catch (reason) { setModalError(reason instanceof Error ? reason.message : '账号操作失败'); }
    finally { setBusy(false); }
  }
  const isBusiness = type === 'BUSINESS';
  const actionTitle = modal?.kind === 'delete' ? '确认删除账号？' : modal?.kind === 'status' ? modal.account.status === 'ACTIVE' ? '确认停用账号？' : '确认启用账号？' : '';

  return <div className="admin-page"><AdminSidebar /><div className="admin-stage"><AdminTopbar title="账号管理" onLogout={() => { signOut(); navigate('/admin/login', { replace: true }); }} /><main className="admin-content admin-accounts">
    <div className="admin-heading"><div><span className="admin-kicker">ACCOUNTS / DIRECTORY</span><h1>账号管理</h1><p>管理个人用户与企业账号，查看资料、积分记录和企业内容。</p></div><button type="button" className="accounts-primary" onClick={() => open({ kind: 'create' })}>＋ 新增{isBusiness ? '企业账号' : '个人用户'}</button></div>
    <nav className="accounts-tabs" aria-label="账号类型"><button type="button" className={!isBusiness ? 'active' : ''} aria-pressed={!isBusiness} onClick={() => changeType('PERSONAL')}>个人用户</button><button type="button" className={isBusiness ? 'active' : ''} aria-pressed={isBusiness} onClick={() => changeType('BUSINESS')}>企业账号</button></nav>
    <section className="accounts-panel" aria-label={isBusiness ? '企业账号列表' : '个人用户列表'}>
      <form className="accounts-toolbar" onSubmit={(event) => { event.preventDefault(); setFilters((current) => ({ ...current, query: query.trim(), page: 1 })); }}>
        <label className="accounts-query"><span>查询账号</span><input type="search" maxLength={120} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isBusiness ? '企业名称、邮箱或昵称' : '用户邮箱或昵称'} /></label>
        <label><span>账号状态</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}><option value="ALL">全部状态</option><option value="ACTIVE">正常</option><option value="DISABLED">已停用</option></select></label>
        <button type="submit" className="accounts-primary" disabled={loading}>查询</button><button type="button" onClick={() => { setQuery(''); setFilters({ status: 'ALL', query: '', page: 1 }); }}>重置</button><button type="button" disabled={loading} onClick={() => void load()}>刷新</button>
      </form>
      {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="accounts-notice" role="status">{notice}</div>}
      <div className="accounts-table-scroll" aria-busy={loading}><table className="accounts-table"><thead><tr><th>{isBusiness ? '企业 / 账号' : '用户 / 邮箱'}</th><th>账号状态</th><th>{isBusiness ? '认证状态' : '积分余额'}</th>{isBusiness && <th>企业内容</th>}<th>注册 / 最近登录</th><th className="accounts-actions-heading">操作</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={isBusiness ? 6 : 5} className="accounts-empty">正在加载账号…</td></tr> : !result?.items.length ? <tr><td colSpan={isBusiness ? 6 : 5} className="accounts-empty">暂无符合条件的账号，请调整查询条件。</td></tr> : result.items.map((account) => <tr key={account.id}>
          <td><strong>{isBusiness ? account.companyName : account.displayName}</strong><small>{account.email}</small>{isBusiness && <small>账号昵称：{account.displayName}</small>}</td>
          <td><span className={`account-badge ${account.status.toLowerCase()}`}>{account.status === 'ACTIVE' ? '正常' : '已停用'}</span></td>
          <td>{isBusiness ? <span className={`account-badge ${account.certificationStatus.toLowerCase()}`}>{certificationLabels[account.certificationStatus] || account.certificationStatus}</span> : <span className="account-balance">{account.balance.toLocaleString('zh-CN')}<small>积分</small></span>}</td>
          {isBusiness && <td><span>{account.materialCount} 条材料</span><small>{account.caseCount} 个案例</small></td>}
          <td><span>{dateLabel(account.createdAt)}</span><small>{dateLabel(account.lastLoginAt)}</small></td>
          <td><div className="accounts-row-actions"><button type="button" onClick={() => open({ kind: 'detail', id: account.id })}>详情</button><button type="button" onClick={() => open({ kind: 'edit', account })}>编辑</button><button type="button" onClick={() => open({ kind: 'status', account })}>{account.status === 'ACTIVE' ? '停用' : '启用'}</button><button type="button" className="accounts-danger-text" onClick={() => open({ kind: 'delete', account })}>删除</button></div></td>
        </tr>)}
      </tbody></table></div>
      <footer className="accounts-pagination"><span>共 {result?.total || 0} 个账号 · 第 {filters.page} / {Math.max(1, result?.totalPages || 0)} 页</span><div><button type="button" disabled={loading || filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>上一页</button><button type="button" disabled={loading || filters.page >= (result?.totalPages || 0)} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>下一页</button></div></footer>
    </section>
  </main></div>
    {modal && <AccountDialog title={modal.kind === 'create' ? `新增${isBusiness ? '企业账号' : '个人用户'}` : modal.kind === 'edit' ? '编辑账号资料' : modal.kind === 'detail' ? '账号详情' : actionTitle} busy={busy} onClose={() => setModal(null)} wide={modal.kind === 'detail'}>
      {modalError && <div className="admin-error" role="alert">{modalError}</div>}
      {(modal.kind === 'create' || modal.kind === 'edit') && <form className="accounts-form" onSubmit={(event) => void save(event)}>
        <label>登录邮箱<input required type="email" maxLength={320} autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
        <label>账号昵称<input required maxLength={120} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label>
        {isBusiness && <label>企业名称<input required maxLength={160} value={draft.companyName} onChange={(event) => setDraft({ ...draft, companyName: event.target.value })} /><small>保存后同步更新企业档案和认证资料中的企业名称。</small></label>}
        {modal.kind === 'create' ? <label>初始密码<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /><small>至少 8 个字符，最多 72 个 UTF-8 字节。</small></label> : <p className="accounts-hint">修改登录邮箱后，该账号需要重新登录。</p>}
        <footer className="accounts-dialog-actions"><button type="button" disabled={busy} onClick={() => setModal(null)}>取消</button><button type="submit" className="accounts-primary" disabled={busy}>{busy ? '保存中…' : modal.kind === 'create' ? '创建账号' : '保存修改'}</button></footer>
      </form>}
      {(modal.kind === 'status' || modal.kind === 'delete') && <><p className="accounts-confirm-name">{modal.account.companyName || modal.account.displayName}<small>{modal.account.email}</small></p><p className="accounts-hint">{modal.kind === 'delete' ? '删除后账号无法登录，并退出全部设备。积分、订单和审核历史会保留，邮箱仍被占用；此页面无法恢复已删除的账号。' : modal.account.status === 'ACTIVE' ? '停用后该账号将立即退出全部设备，在重新启用前无法登录。' : '启用后用户可使用原有邮箱和密码重新登录。'}</p><footer className="accounts-dialog-actions"><button type="button" disabled={busy} onClick={() => setModal(null)}>取消</button><button type="button" className={modal.kind === 'delete' ? 'accounts-danger' : 'accounts-primary'} disabled={busy} onClick={() => void confirmAction()}>{busy ? '处理中…' : modal.kind === 'delete' ? '确认删除' : modal.account.status === 'ACTIVE' ? '确认停用' : '确认启用'}</button></footer></>}
      {modal.kind === 'detail' && (detailLoading ? <div className="accounts-empty">正在读取账号详情…</div> : detail && <div className="accounts-detail">
        <dl className="accounts-identity"><div><dt>昵称</dt><dd>{detail.account.displayName}</dd></div><div><dt>登录邮箱</dt><dd>{detail.account.email}</dd></div><div><dt>账号状态</dt><dd>{detail.account.status === 'ACTIVE' ? '正常' : '已停用'}</dd></div><div><dt>注册时间</dt><dd>{dateLabel(detail.account.createdAt)}</dd></div><div><dt>最近登录</dt><dd>{dateLabel(detail.account.lastLoginAt)}</dd></div>{detail.account.companyId ? <div><dt>企业名称</dt><dd>{detail.account.companyName}</dd></div> : <div><dt>积分余额</dt><dd>{detail.account.balance.toLocaleString('zh-CN')} 积分</dd></div>}</dl>
        {detail.account.companyId ? <section><h3>企业资料</h3><p>{certificationLabels[detail.account.certificationStatus]} · {detail.account.materialCount} 条材料 · {detail.account.caseCount} 个案例</p><Link className="accounts-detail-link" to={`/admin/marketplace/companies/${detail.account.companyId}`}>查看认证资料、案例、材料报价与风格资料 →</Link></section> : <>
          <section><header className="accounts-section-heading"><h3>最近积分记录</h3><Link to="/admin/credits">前往积分管理 →</Link></header><div className="accounts-detail-table-scroll"><table className="accounts-table"><thead><tr><th>类型 / 说明</th><th>变动</th><th>变动后余额</th><th>时间</th></tr></thead><tbody>{detail.creditEntries.length ? detail.creditEntries.map((entry) => <tr key={entry.id}><td>{creditLabels[entry.eventType] || entry.eventType}<small>{entry.note}</small></td><td className={entry.delta > 0 ? 'account-positive' : ''}>{entry.delta > 0 ? '+' : ''}{entry.delta}</td><td>{entry.balanceAfter}</td><td>{dateLabel(entry.createdAt)}</td></tr>) : <tr><td colSpan={4}>暂无积分记录</td></tr>}</tbody></table></div><p className="accounts-hint">展示最近 100 条记录。</p></section>
          <section><h3>最近投稿记录</h3><div className="accounts-detail-table-scroll"><table className="accounts-table"><thead><tr><th>方案</th><th>风格</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{detail.submissions.length ? detail.submissions.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.style}</td><td>{submissionLabels[item.status] || item.status}</td><td>{dateLabel(item.updatedAt)}</td></tr>) : <tr><td colSpan={4}>暂无投稿记录</td></tr>}</tbody></table></div><p className="accounts-hint">展示最近 100 条投稿。</p></section>
        </>}
      </div>)}
    </AccountDialog>}
  </div>;
}
