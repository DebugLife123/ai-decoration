import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDownload, apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminCompanyDetailPage.css';

interface Asset { id: string; fileName: string; mediaType: string; uploadedAt: string; available: boolean }
interface StyleProfile { style: string; name: string; note: string | null; reason: string | null; minBudgetWan: number; maxBudgetWan: number | null; regions: string[]; priority: number }
interface CompanyDetail {
  companyId: string; registeredName: string; accountEmails: string[];
  certification: null | { id: string; companyName: string; contactName: string; contactInfo: string; serviceAreas: string[]; documentRefs: string[]; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote: string | null; submittedAt: string; updatedAt: string };
  profile: null | { name: string; city: string; services: string; intro: string; publicContactName: string; publicContactInfo: string; updatedAt: string };
  styleProfile: { profiles: StyleProfile[]; updatedAt: string | null };
  cases: { id: string; title: string; area: number | null; style: string | null; budget: number | null; status: string; createdAt: string; updatedAt: string; files: Asset[] }[];
  materialQuotes: { id: string; name: string; specification: string; brand: string | null; category: string; region: string; unit: string; price: number; validUntil: string; hidden: boolean; hiddenReason: string | null; updatedAt: string; images: Asset[] }[];
  laborQuotes: { type: string; unit: string; price: number; region: string; validUntil: string; updatedAt: string }[];
  assets: Asset[];
}

const certificationLabels = { PENDING: '待审核', APPROVED: '已认证', REJECTED: '未通过' };
function dateLabel(value?: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function money(value: number | null) { return value == null ? '—' : `¥${value.toLocaleString('zh-CN')}`; }

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

export default function AdminCompanyDetailPage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ asset: Asset; url: string } | null>(null);
  const [opening, setOpening] = useState('');
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let active = true;
    void apiRequest<CompanyDetail>(`/api/v1/admin/marketplace/companies/${companyId}`)
      .then((value) => { if (active) setDetail(value); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : '企业资料读取失败。'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function openAsset(asset: Asset) {
    if (!asset.available) { setError(`${asset.fileName} 的文件本体已丢失，无法预览。`); return; }
    setOpening(asset.id); setError('');
    try {
      const blob = await apiDownload(`/api/v1/admin/marketplace/companies/${companyId}/assets/${asset.id}`);
      setPreview((current) => { if (current) URL.revokeObjectURL(current.url); return { asset, url: URL.createObjectURL(blob) }; });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '文件读取失败。'); }
    finally { setOpening(''); }
  }


  function logout() { signOut(); navigate('/admin/login', { replace: true }); }
  const assets = new Map((detail?.assets || []).map((asset) => [asset.id, asset]));
  const certification = detail?.certification;
  const title = detail?.profile?.name || certification?.companyName || detail?.registeredName || '企业详情';
  const linkedAssetIds = new Set([
    ...(certification?.documentRefs || []),
    ...(detail?.cases.flatMap((item) => item.files.map((asset) => asset.id)) || []),
    ...(detail?.materialQuotes.flatMap((item) => item.images.map((asset) => asset.id)) || []),
  ]);
  const linkedAssets = detail?.assets.filter((asset) => linkedAssetIds.has(asset.id)) || [];

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
      <header className="admin-topbar"><div className="admin-breadcrumb"><Link to="/admin/marketplace">企业与材料</Link><b>/</b><strong>企业详情</strong></div><div className="admin-topbar-actions"><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={logout} title="退出登录" aria-label="退出登录"><Icon name="logout" /></button></div></header>
      <main className="admin-content admin-company-detail">
        <button className="admin-detail-back" type="button" onClick={() => navigate('/admin/marketplace')}>← 返回企业列表</button>
        {loading ? <div className="admin-empty">正在读取企业资料…</div> : error && !detail ? <div className="admin-error" role="alert">{error}</div> : detail ? <>
          <div className="admin-heading"><div><span className="admin-kicker">COMPANY / {detail.companyId}</span><h1>{title}</h1><p>{detail.registeredName}{detail.profile?.city ? ` · ${detail.profile.city}` : ''}</p></div>{certification && <span className={`admin-status ${certification.status.toLowerCase()}`}>{certificationLabels[certification.status]}</span>}</div>
          {error && <div className="admin-error" role="alert">{error}</div>}
          <section className="admin-detail-section-grid">
            <section className="admin-company-section"><header><span className="admin-kicker">IDENTITY</span><h2>企业与认证信息</h2></header><dl><div><dt>企业名称</dt><dd>{certification?.companyName || detail.registeredName}</dd></div><div><dt>登录账号</dt><dd>{detail.accountEmails.length ? detail.accountEmails.join('、') : '—'}</dd></div><div><dt>联系人</dt><dd>{certification?.contactName || '—'}</dd></div><div><dt>认证联系方式</dt><dd>{certification?.contactInfo || '—'}</dd></div><div><dt>公开业务联系人</dt><dd>{detail.profile?.publicContactName || '—'}</dd></div><div><dt>公开业务联系方式</dt><dd>{detail.profile?.publicContactInfo || '—'}</dd></div><div><dt>服务地区</dt><dd>{certification?.serviceAreas.join('、') || '—'}</dd></div><div><dt>认证提交时间</dt><dd>{dateLabel(certification?.submittedAt)}</dd></div>{certification?.reviewNote && <div><dt>审核备注</dt><dd>{certification.reviewNote}</dd></div>}</dl></section>
            <section className="admin-company-section"><header><span className="admin-kicker">BUSINESS PROFILE</span><h2>企业档案</h2></header>{detail.profile ? <><dl><div><dt>企业展示名称</dt><dd>{detail.profile.name}</dd></div><div><dt>所在城市</dt><dd>{detail.profile.city || '—'}</dd></div><div><dt>主营业务</dt><dd>{detail.profile.services || '—'}</dd></div><div><dt>资料更新时间</dt><dd>{dateLabel(detail.profile.updatedAt)}</dd></div></dl><p className="admin-company-intro">{detail.profile.intro || '企业尚未填写介绍。'}</p></> : <p className="admin-company-muted">企业尚未填写档案。</p>}</section>
          </section>
            <section className="admin-company-section admin-company-documents"><header><div><span className="admin-kicker">CERTIFICATION FILES</span><h2>认证材料 <small>{certification?.documentRefs.length || 0}</small></h2></div></header>{certification?.documentRefs.length ? <div className="admin-company-file-list">{certification.documentRefs.map((id) => { const asset = assets.get(id); return asset ? <button type="button" key={id} onClick={() => void openAsset(asset)} disabled={!asset.available || opening === id}><Icon name="file" /><span><strong>{asset.fileName}</strong><small>{asset.available ? asset.mediaType : '文件本体缺失'} · 上传于 {dateLabel(asset.uploadedAt)}</small></span><em>{!asset.available ? '不可用' : opening === id ? '读取中…' : '预览'}</em></button> : <div key={id} className="admin-company-missing">文件记录不可用 · {id}</div>; })}</div> : <p className="admin-company-muted">未提交认证附件。</p>}</section>
          <section className="admin-company-section"><header><div><span className="admin-kicker">PORTFOLIO</span><h2>企业案例 <small>{detail.cases.length}</small></h2></div></header>{detail.cases.length ? <div className="admin-company-card-grid">{detail.cases.map((item) => <article className="admin-company-record" key={item.id}><div className="admin-company-record-title"><strong>{item.title}</strong><span className={`admin-status ${item.status === 'published' ? 'approved' : 'pending'}`}>{item.status === 'published' ? '已发布' : '草稿'}</span></div><p>{item.style || '未填写风格'} · {item.area ? `${item.area} ㎡` : '面积未填'} · 预算 {money(item.budget)}</p><div className="admin-company-file-chips">{item.files.length ? item.files.map((asset) => <button type="button" key={asset.id} onClick={() => void openAsset(asset)} disabled={!asset.available || opening === asset.id}>{asset.available ? asset.fileName : `${asset.fileName} · 文件缺失`}</button>) : <span>没有关联图片</span>}</div></article>)}</div> : <p className="admin-company-muted">企业尚未上传案例。</p>}</section>
          <section className="admin-company-section"><header><div><span className="admin-kicker">MATERIAL QUOTES</span><h2>材料报价 <small>{detail.materialQuotes.length}</small></h2></div></header>{detail.materialQuotes.length ? <div className="admin-company-table-wrap"><table className="admin-market-table"><thead><tr><th>材料</th><th>类别 / 地区</th><th>报价</th><th>有效期</th><th>展示状态</th><th>图片</th></tr></thead><tbody>{detail.materialQuotes.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.brand || '无品牌'} · {item.specification}</small></td><td>{item.category}<small>{item.region}</small></td><td>{money(item.price)} / {item.unit}</td><td>{item.validUntil}</td><td><span className={`admin-market-visibility ${item.hidden ? 'hidden' : item.validUntil < today ? 'expired' : 'public'}`}>{item.hidden ? `已下架${item.hiddenReason ? ` · ${item.hiddenReason}` : ''}` : item.validUntil < today ? '已过期' : '正常'}</span></td><td><div className="admin-company-file-chips">{item.images.map((asset) => <button type="button" key={asset.id} onClick={() => void openAsset(asset)} disabled={!asset.available || opening === asset.id}>{asset.available ? asset.fileName : `${asset.fileName} · 文件缺失`}</button>)}</div></td></tr>)}</tbody></table></div> : <p className="admin-company-muted">企业尚未上传材料报价。</p>}</section>
          <section className="admin-detail-section-grid">
            <section className="admin-company-section"><header><div><span className="admin-kicker">STYLE EXPERTISE</span><h2>风格资料 <small>{detail.styleProfile.profiles.length}</small></h2></div></header>{detail.styleProfile.profiles.length ? <div className="admin-company-card-grid">{detail.styleProfile.profiles.map((item) => <article className="admin-company-record" key={item.style}><strong>{item.name}</strong><p>{item.style} · ¥{item.minBudgetWan}万{item.maxBudgetWan == null ? '起' : ` - ¥${item.maxBudgetWan}万`}</p><p>{item.regions.join('、') || '未限定地区'}</p><p>{item.note || item.reason || '—'}</p></article>)}</div> : <p className="admin-company-muted">企业尚未填写风格资料。</p>}</section>
            <section className="admin-company-section"><header><div><span className="admin-kicker">LABOR QUOTES</span><h2>人工报价 <small>{detail.laborQuotes.length}</small></h2></div></header>{detail.laborQuotes.length ? <div className="admin-company-card-grid">{detail.laborQuotes.map((item) => <article className="admin-company-record" key={`${item.type}-${item.region}`}><strong>{item.type}</strong><p>{item.region} · {money(item.price)} / {item.unit}</p><p>有效期至 {item.validUntil}</p></article>)}</div> : <p className="admin-company-muted">企业尚未上传人工报价。</p>}</section>
          </section>
          <section className="admin-company-section"><header><div><span className="admin-kicker">ATTACHED FILES</span><h2>已关联资料文件 <small>{linkedAssets.length}</small></h2></div></header>{linkedAssets.length ? <div className="admin-company-assets">{linkedAssets.map((asset) => <button type="button" key={asset.id} onClick={() => void openAsset(asset)} disabled={!asset.available || opening === asset.id}><span className="admin-company-asset-icon"><Icon name="file" /></span><span><strong>{asset.fileName}</strong><small>{asset.available ? asset.mediaType : '文件本体缺失'} · {dateLabel(asset.uploadedAt)}</small></span><em>{!asset.available ? '不可用' : opening === asset.id ? '读取中…' : '预览'}</em></button>)}</div> : <p className="admin-company-muted">没有已关联的资料文件。</p>}</section>
        </> : null}
      </main>
    </div>
    {preview && <div className="admin-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><section className="admin-preview-dialog" role="dialog" aria-modal="true" aria-label={preview.asset.fileName}><header><strong>{preview.asset.fileName}</strong><button type="button" onClick={() => setPreview(null)}>关闭</button></header><div className="admin-preview-content">{preview.asset.mediaType.startsWith('image/') ? <img src={preview.url} alt={preview.asset.fileName} /> : preview.asset.mediaType === 'application/pdf' ? <iframe src={preview.url} title={preview.asset.fileName} /> : <p>该文件类型无法在浏览器中预览。</p>}</div></section></div>}
  </div>;
}
