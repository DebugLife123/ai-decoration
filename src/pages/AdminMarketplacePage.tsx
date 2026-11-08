import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, authApiBaseUrl, currentAccessToken } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminMarketplacePage.css';

type CertificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type View = 'companies' | 'materials';
interface Certification { companyId: string; registeredCompanyName: string; accountEmail: string | null; demo: boolean; certification: { companyName: string; contactName: string; contactInfo: string; status: CertificationStatus; reviewNote: string | null; submittedAt: string; updatedAt: string } }
interface Quote { id: string; companyId: string; companyName: string; certificationStatus: string; name: string; specification: string; brand: string | null; category: string; region: string; unit: string; price: number; validUntil: string; hidden: boolean; hiddenReason: string | null; updatedAt: string; demo: boolean }
interface QuotePage { items: Quote[]; page: number; size: number; total: number; totalPages: number }
type Visibility = 'ALL' | 'PUBLISHED' | 'HIDDEN' | 'EXPIRED';

const statusLabels: Record<CertificationStatus, string> = { PENDING: '待审核', APPROVED: '已认证', REJECTED: '未通过' };

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

function dateLabel(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminMarketplacePage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [view, setView] = useState<View>('companies');
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | CertificationStatus>('ALL');
  const [visibility, setVisibility] = useState<Visibility>('ALL');
  const [companies, setCompanies] = useState<Certification[]>([]);
  const [quotes, setQuotes] = useState<QuotePage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [moderating, setModerating] = useState<Quote | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const [companyKind, setCompanyKind] = useState<'ALL' | 'REAL' | 'DEMO'>('ALL');
  const [importing, setImporting] = useState(false);
  const [importForm, setImportForm] = useState({ companyName: '', email: '', password: '', contactName: '', contactInfo: '', city: '', services: '', intro: '', serviceAreas: '', caseTitle: '', caseArea: '', caseStyle: '', caseBudget: '', materialName: '', materialSpec: '', materialBrand: '', materialUnit: '', materialPrice: '', materialCategory: '', materialRegion: '', materialValidUntil: '' });
  const [caseImages, setCaseImages] = useState<File[]>([]);
  const [materialImages, setMaterialImages] = useState<File[]>([]);
  const [importedCompany, setImportedCompany] = useState<{ email: string; companyId: string; firstCaseId: string | null; firstQuoteId: string | null } | null>(null);
  const [uploadedCaseFiles, setUploadedCaseFiles] = useState<{ fingerprint: string; id: string }[]>([]);
  const [uploadedMaterialFiles, setUploadedMaterialFiles] = useState<{ fingerprint: string; id: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      if (view === 'companies') {
        if (status !== 'ALL') params.set('status', status);
        if (companyKind !== 'ALL') params.set('kind', companyKind);
        setCompanies(await apiRequest<Certification[]>(`/api/v1/admin/certifications?${params}`));
      } else {
        params.set('visibility', visibility); params.set('page', String(page)); params.set('size', '20');
        setQuotes(await apiRequest<QuotePage>(`/api/v1/admin/marketplace/material-quotes?${params}`));
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '管理数据加载失败。'); }
    finally { setLoading(false); }
  }, [companyKind, page, query, status, view, visibility]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }
  function logout() { signOut(); navigate('/admin/login', { replace: true }); }

  async function setQuoteVisibility(quote: Quote, hidden: boolean, explanation = '') {
    setBusyId(quote.id); setError(''); setNotice('');
    try {
      await apiRequest<Quote>(`/api/v1/admin/marketplace/material-quotes/${quote.id}/visibility`, {
        method: 'PATCH', body: JSON.stringify({ hidden, reason: explanation.trim() || null }),
      });
      setModerating(null); setReason(''); setNotice(hidden ? '材料报价已下架。' : '材料报价已恢复展示。');
      await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '更新展示状态失败。'); }
    finally { setBusyId(''); }
  }

  async function submitCompanyImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyId('import'); setError(''); setNotice('');
    let accountCreated = Boolean(importedCompany);
    try {
      if (caseImages.length && !importForm.caseTitle.trim()) throw new Error('请先填写案例名称，再选择案例图片。');
      if (caseImages.some((file) => file.size > 15 * 1024 * 1024)) throw new Error('单张案例图片不能超过 15 MB。');
      if (materialImages.length && !importForm.materialName.trim()) throw new Error('请先填写材料名称，再选择材料图片。');
      if (materialImages.length > 8) throw new Error('材料图片最多选择 8 张。');
      if (materialImages.some((file) => file.size > 15 * 1024 * 1024)) throw new Error('单张材料图片不能超过 15 MB。');
      const { caseTitle, caseArea, caseStyle, caseBudget, materialName, materialSpec, materialBrand, materialUnit, materialPrice, materialCategory, materialRegion, materialValidUntil, ...company } = importForm;
      const cases = caseTitle.trim() ? [{ title: caseTitle.trim(), area: caseArea ? Number(caseArea) : null, style: caseStyle, budget: caseBudget ? Number(caseBudget) : null }] : [];
      const materials = materialName.trim() ? [{ name: materialName.trim(), specification: materialSpec, brand: materialBrand, unit: materialUnit, price: Number(materialPrice), category: materialCategory, region: materialRegion, validUntil: materialValidUntil }] : [];
      let result = importedCompany;
      if (!result) {
        result = await apiRequest<{ email: string; companyId: string; firstCaseId: string | null; firstQuoteId: string | null }>('/api/v1/admin/marketplace/companies/import', { method: 'POST', body: JSON.stringify({ ...company, serviceAreas: company.serviceAreas.split(/[,，、]/).map((value) => value.trim()).filter(Boolean), cases, materials }) });
        setImportedCompany(result);
        accountCreated = true;
      }
      if (result.firstCaseId && caseImages.length) {
        const uploadedFiles = [...uploadedCaseFiles];
        for (const file of caseImages) {
          const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
          if (uploadedFiles.some((item) => item.fingerprint === fingerprint)) continue;
          const body = new FormData(); body.append('file', file);
          const response = await fetch(`${authApiBaseUrl}/api/v1/admin/marketplace/companies/${result.companyId}/assets`, { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}` }, body });
          const payload = await response.json() as { data?: { id: string }; message?: string };
          if (!response.ok || !payload.data?.id) throw new Error(payload.message || '案例图片上传失败');
          uploadedFiles.push({ fingerprint, id: payload.data.id });
          setUploadedCaseFiles(uploadedFiles);
        }
        await apiRequest(`/api/v1/admin/marketplace/companies/${result.companyId}/cases/${result.firstCaseId}/files`, { method: 'POST', body: JSON.stringify({ fileIds: uploadedFiles.map((item) => item.id) }) });
      }
      if (result.firstQuoteId && materialImages.length) {
        const uploadedFiles = [...uploadedMaterialFiles];
        for (const file of materialImages) {
          const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
          if (uploadedFiles.some((item) => item.fingerprint === fingerprint)) continue;
          const body = new FormData(); body.append('file', file);
          const response = await fetch(`${authApiBaseUrl}/api/v1/admin/marketplace/companies/${result.companyId}/assets`, { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${currentAccessToken()}` }, body });
          const payload = await response.json() as { data?: { id: string }; message?: string };
          if (!response.ok || !payload.data?.id) throw new Error(payload.message || '材料图片上传失败');
          uploadedFiles.push({ fingerprint, id: payload.data.id });
          setUploadedMaterialFiles(uploadedFiles);
        }
        await apiRequest(`/api/v1/admin/marketplace/companies/${result.companyId}/material-quotes/${result.firstQuoteId}/images`, { method: 'POST', body: JSON.stringify({ imageIds: uploadedFiles.map((item) => item.id) }) });
      }
      setImporting(false); setImportedCompany(null); setUploadedCaseFiles([]); setUploadedMaterialFiles([]); setCaseImages([]); setMaterialImages([]); setNotice(`企业账号已创建，认证待审核。登录邮箱：${result.email}`); setView('companies'); setStatus('PENDING'); setCompanyKind('REAL'); await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '企业录入失败。');
      if (accountCreated) setNotice('企业账号和认证已创建；图片未完成关联，请保留当前选择后再次点击继续。');
    }
    finally { setBusyId(''); }
  }

  return <div className="admin-page">
    <aside className="admin-rail">
      <div className="admin-brand"><span className="admin-brand-mark"><Icon name="shield" /></span><span><strong>简艺装</strong><small>CONTROL ROOM</small></span></div>
      <div className="admin-rail-label">平台治理</div>
      <Link className="admin-rail-link" to="/admin"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业认证</strong><small>准入审核队列</small></span></Link>
      <Link className="admin-rail-current" aria-current="page" to="/admin/marketplace"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业与材料</strong><small>企业状态与公开报价</small></span></Link>
      <Link className="admin-rail-link" to="/admin/assets"><span className="admin-rail-icon"><Icon name="file" /></span><span><strong>图片清理</strong><small>未关联图片管理</small></span></Link>
      <Link className="admin-rail-link" to="/admin/audit"><span className="admin-rail-icon"><Icon name="shield" /></span><span><strong>操作日志</strong><small>管理员操作记录</small></span></Link>
      <div className="admin-rail-footer"><i />运行正常<span>INTERNAL CONSOLE</span></div>
    </aside>
    <div className="admin-stage">
      <header className="admin-topbar"><div className="admin-breadcrumb"><span>平台治理</span><b>/</b><strong>企业与材料</strong></div><div className="admin-topbar-actions"><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={logout} title="退出登录" aria-label="退出登录"><Icon name="logout" /></button></div></header>
      <main className="admin-content">
        <div className="admin-heading"><div><span className="admin-kicker">TRUST / MARKETPLACE</span><h1>企业与材料管理</h1><p>搜索企业认证资料，管理用户端可见的材料报价。</p></div><button className="admin-refresh" type="button" onClick={() => void load()} disabled={loading}><Icon name="refresh" />{loading ? '同步中' : '刷新'}</button></div>
        <section className="admin-market-toolbar">
          <div className="admin-market-tabs" role="tablist" aria-label="管理对象"><button type="button" role="tab" aria-selected={view === 'companies'} className={view === 'companies' ? 'active' : ''} onClick={() => { setView('companies'); setPage(1); }}>企业</button><button type="button" role="tab" aria-selected={view === 'materials'} className={view === 'materials' ? 'active' : ''} onClick={() => { setView('materials'); setPage(1); }}>材料报价</button></div>
          <form onSubmit={search}><input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder={view === 'companies' ? '搜索企业名称或账号邮箱' : '搜索材料、品牌、类别或企业'} aria-label="搜索" /><button type="submit">搜索</button></form>
          {view === 'companies' ? <><select aria-label="认证状态" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="ALL">全部认证状态</option><option value="PENDING">待审核</option><option value="APPROVED">已认证</option><option value="REJECTED">未通过</option></select><select aria-label="企业类型" value={companyKind} onChange={(event) => { setCompanyKind(event.target.value as typeof companyKind); setPage(1); }}><option value="ALL">全部企业</option><option value="REAL">真实企业</option><option value="DEMO">演示企业</option></select></> : <select aria-label="报价状态" value={visibility} onChange={(event) => { setVisibility(event.target.value as Visibility); setPage(1); }}><option value="ALL">全部报价</option><option value="PUBLISHED">公开中</option><option value="HIDDEN">已下架</option><option value="EXPIRED">已过期</option></select>}
          {view === 'companies' && <button type="button" className="admin-market-action restore" onClick={() => setImporting(true)}>录入真实企业</button>}
        </section>
        {error && <div className="admin-error" role="alert">{error}</div>}{notice && <div className="admin-success" role="status">{notice}</div>}
        <section className="admin-market-panel">
          <div className="admin-market-panel-head"><div><span className="admin-kicker">{view === 'companies' ? 'COMPANY DIRECTORY' : 'PUBLIC MATERIAL CATALOG'}</span><h2>{view === 'companies' ? '企业认证资料' : '材料报价'} <small>{view === 'companies' ? companies.length : quotes?.total ?? 0}</small></h2></div><span>{view === 'materials' ? '过期或被下架的报价不会出现在用户端' : '仅显示已提交认证资料的企业'}</span></div>
          {loading ? <div className="admin-empty">正在读取管理数据…</div> : view === 'companies' ? companies.length === 0 ? <div className="admin-empty"><strong>没有匹配的企业资料</strong></div> : <div className="admin-market-table-wrap"><table className="admin-market-table"><thead><tr><th>企业名称</th><th>账号</th><th>联系人</th><th>认证状态</th><th>提交时间</th><th>审核备注</th></tr></thead><tbody>{companies.map((item) => <tr key={item.companyId} className="admin-company-row" role="link" aria-label={`查看${item.certification.companyName}详情`} tabIndex={0} onClick={() => navigate(`/admin/marketplace/companies/${item.companyId}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(`/admin/marketplace/companies/${item.companyId}`); } }}><td><strong>{item.certification.companyName}</strong><small>{item.registeredCompanyName}</small></td><td>{item.accountEmail || '—'}</td><td><strong>{item.certification.contactName}</strong><small>{item.certification.contactInfo}</small></td><td><span className={`admin-status ${item.certification.status.toLowerCase()}`}>{statusLabels[item.certification.status]}</span></td><td>{dateLabel(item.certification.submittedAt)}</td><td>{item.certification.reviewNote || '—'}</td></tr>)}</tbody></table></div> : !quotes?.items.length ? <div className="admin-empty"><strong>没有匹配的材料报价</strong></div> : <><div className="admin-market-table-wrap"><table className="admin-market-table"><thead><tr><th>材料</th><th>所属企业</th><th>认证</th><th>地区</th><th>价格</th><th>有效期</th><th>展示状态</th><th>操作</th></tr></thead><tbody>{quotes.items.map((quote) => <tr key={quote.id}><td><strong>{quote.name}</strong><small>{quote.brand || '无品牌'} · {quote.specification} · {quote.category}</small></td><td>{quote.companyName}</td><td><span className={`admin-status ${quote.certificationStatus.toLowerCase()}`}>{quote.certificationStatus === 'APPROVED' ? '已认证' : quote.certificationStatus === 'PENDING' ? '待审核' : quote.certificationStatus === 'REJECTED' ? '未通过' : '未提交'}</span></td><td>{quote.region}</td><td>¥{quote.price.toFixed(2)} / {quote.unit}</td><td className={quote.validUntil < today ? 'expired' : ''}>{quote.validUntil}</td><td><span className={`admin-market-visibility ${quote.hidden ? 'hidden' : quote.validUntil < today ? 'expired' : quote.certificationStatus !== 'APPROVED' ? 'blocked' : 'public'}`}>{quote.hidden ? `已下架${quote.hiddenReason ? ` · ${quote.hiddenReason}` : ''}` : quote.validUntil < today ? '已过期' : quote.certificationStatus === 'APPROVED' ? '公开中' : '认证未通过'}</span></td><td>{quote.hidden ? <button className="admin-market-action restore" type="button" disabled={busyId === quote.id} onClick={() => void setQuoteVisibility(quote, false)}>恢复展示</button> : <button className="admin-market-action hide" type="button" disabled={busyId === quote.id} onClick={() => { setModerating(quote); setReason(''); }}>下架</button>}</td></tr>)}</tbody></table></div><div className="admin-assets-pagination"><span>第 {quotes.page} / {Math.max(1, quotes.totalPages)} 页 · 共 {quotes.total} 条报价</span><div><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>上一页</button><button type="button" onClick={() => setPage((current) => current + 1)} disabled={page >= quotes.totalPages}>下一页</button></div></div></>}
        </section>
      </main>
    </div>
    {importing && <div className="admin-market-backdrop"><form className="admin-market-dialog admin-import-form" onSubmit={submitCompanyImport}><h2>录入真实企业</h2><p>创建企业管理员账号与待审核认证。案例存为草稿，认证通过前报价不会公开。</p><div className="admin-import-grid">{([['companyName','企业名称'],['email','登录邮箱'],['password','初始密码'],['contactName','联系人'],['contactInfo','联系电话/业务联系'],['city','所在城市'],['services','业务范围'],['serviceAreas','服务地区（逗号分隔）']] as const).map(([key,label]) => <label key={key}>{label}<input required={['companyName','email','password','contactName','contactInfo'].includes(key)} type={key === 'email' ? 'email' : key === 'password' ? 'password' : 'text'} minLength={key === 'password' ? 8 : undefined} value={importForm[key]} onChange={(event) => setImportForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div><label>企业简介<textarea value={importForm.intro} onChange={(event) => setImportForm((current) => ({ ...current, intro: event.target.value }))} /></label><details><summary>附加一条案例草稿</summary><div className="admin-import-grid">{([['caseTitle','案例名称'],['caseArea','面积'],['caseStyle','风格'],['caseBudget','预算（万元）']] as const).map(([key,label]) => <label key={key}>{label}<input type="text" value={importForm[key]} onChange={(event) => setImportForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div><label className="admin-import-upload">案例图片<input type="file" accept="image/*,.pdf" multiple onChange={(event) => setCaseImages(Array.from(event.target.files || []))} /><small>{caseImages.length ? `已选择 ${caseImages.length} 个文件，创建后会关联到案例草稿。` : '可选择多张图片，单张不超过 15 MB。'}</small></label></details><details><summary>附加一条材料报价</summary><div className="admin-import-grid">{([['materialName','材料名称'],['materialSpec','规格'],['materialBrand','品牌'],['materialUnit','单位'],['materialPrice','价格'],['materialCategory','类别'],['materialRegion','地区'],['materialValidUntil','有效期']] as const).map(([key,label]) => <label key={key}>{label}<input type={key === 'materialValidUntil' ? 'date' : 'text'} value={importForm[key]} onChange={(event) => setImportForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div></details><div><button type="button" onClick={() => setImporting(false)}>取消</button><button type="submit" disabled={busyId === 'import'}>{busyId === 'import' ? '处理中…' : importedCompany ? '继续上传并完成' : '创建并提交认证'}</button></div></form></div>}
    {importing && <label className="admin-import-material-dock">材料图片<input type="file" accept="image/*" multiple onChange={(event) => setMaterialImages(Array.from(event.target.files || []))} /><small>{materialImages.length ? `已选择 ${materialImages.length} 张图片，将在创建后关联到材料报价。` : '最多 8 张，单张不超过 15 MB。'}</small></label>}
    {moderating && <div className="admin-market-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModerating(null); }}><section className="admin-market-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-market-dialog-title"><h2 id="admin-market-dialog-title">下架材料报价</h2><p>{moderating.companyName} · {moderating.name}将从用户端材料目录隐藏。</p><label htmlFor="moderation-reason">下架原因</label><textarea id="moderation-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="例如：报价信息不实、内容违规、用户投诉" /><div><button type="button" onClick={() => setModerating(null)}>取消</button><button type="button" disabled={!reason.trim() || busyId === moderating.id} onClick={() => void setQuoteVisibility(moderating, true, reason)}>{busyId === moderating.id ? '提交中…' : '确认下架'}</button></div></section></div>}
  </div>;
}
