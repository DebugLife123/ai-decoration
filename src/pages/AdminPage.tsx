import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiDownload, apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';

type CertificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type FilterStatus = 'ALL' | CertificationStatus;

interface Certification {
  id: string;
  companyName: string;
  contactName: string;
  contactInfo: string;
  serviceAreas: string[];
  documentRefs: string[];
  status: CertificationStatus;
  reviewNote: string | null;
  version: number;
  submittedAt: string;
  updatedAt: string;
}

interface AdminApplication {
  companyId: string;
  registeredCompanyName: string;
  accountEmail: string | null;
  certification: Certification;
}

const statusLabels: Record<CertificationStatus, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};

function dateLabel(value: string) {
  if (!value) return '未提供';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Icon({ name }: { name: 'shield' | 'refresh' | 'logout' | 'building' | 'file' | 'arrow' }) {
  const paths = {
    shield: <path d="M12 3 20 6v5c0 5-3.4 8.8-8 10-4.6-1.2-8-5-8-10V6l8-3Z" />,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-3.9L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.8 3.9L21 14" /><path d="M21 19v-5h-5" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    building: <><path d="M4 20V8h16v12M2 20h20M7 8V5h10v3M8 12h2M14 12h2M8 16h2M14 16h2" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h8M8 17h5" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('PENDING');
  const [reviewDraft, setReviewDraft] = useState({ companyId: '', value: '' });
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [openingDocument, setOpeningDocument] = useState('');
  const [documentPreview, setDocumentPreview] = useState<{ url: string; type: string; name: string } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (documentPreview) URL.revokeObjectURL(documentPreview.url);
  }, [documentPreview]);

  const loadApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<AdminApplication[]>('/api/v1/admin/certifications');
      setApplications(result);
      setSelectedId((current) => current && result.some((item) => item.companyId === current) ? current : result[0]?.companyId || null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '认证申请加载失败。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void Promise.resolve().then(loadApplications); }, []);

  const counts = useMemo(() => applications.reduce((result, item) => {
    result[item.certification.status] += 1;
    return result;
  }, { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<CertificationStatus, number>), [applications]);

  const visibleApplications = useMemo(() => filter === 'ALL'
    ? applications
    : applications.filter((item) => item.certification.status === filter), [applications, filter]);
  const selected = applications.find((item) => item.companyId === selectedId) || null;
  const reviewNote = reviewDraft.companyId === selected?.companyId
    ? reviewDraft.value
    : selected?.certification.reviewNote || '';

  async function decide(status: Exclude<CertificationStatus, 'PENDING'>) {
    if (!selected || selected.certification.status !== 'PENDING') return;
    setReviewing(true);
    setError('');
    try {
      const certification = await apiRequest<Certification>(`/api/v1/admin/certifications/${selected.companyId}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, reviewNote: reviewNote.trim() || null, version: selected.certification.version }),
      });
      setApplications((current) => current.map((item) => item.companyId === selected.companyId ? { ...item, certification } : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '审核操作失败，请刷新后重试。');
    } finally {
      setReviewing(false);
    }
  }

  async function previewDocument(companyId: string, documentId: string, index: number) {
    setOpeningDocument(documentId);
    setError('');
    try {
      const blob = await apiDownload(`/api/v1/admin/certifications/${companyId}/documents/${documentId}`);
      const extension = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/jpeg' ? 'jpg' : blob.type.startsWith('image/') ? blob.type.slice('image/'.length) : 'bin';
      setDocumentPreview({ url: URL.createObjectURL(blob), type: blob.type, name: `认证材料-${index + 1}.${extension}` });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '认证材料读取失败。');
    } finally {
      setOpeningDocument('');
    }
  }

  function logout() {
    signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="admin-page">
      <aside className="admin-rail">
        <div className="admin-brand"><span className="admin-brand-mark"><Icon name="shield" /></span><span><strong>简艺装</strong><small>CONTROL ROOM</small></span></div>
        <div className="admin-rail-label">平台治理</div>
        <Link className="admin-rail-current" aria-current="page" to="/admin"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业认证</strong><small>准入审核队列</small></span></Link>
        <Link className="admin-rail-link" to="/admin/marketplace"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业与材料</strong><small>企业状态与公开报价</small></span></Link>
        <Link className="admin-rail-link" to="/admin/assets"><span className="admin-rail-icon"><Icon name="file" /></span><span><strong>图片清理</strong><small>未关联图片管理</small></span></Link>
        <Link className="admin-rail-link" to="/admin/audit"><span className="admin-rail-icon"><Icon name="shield" /></span><span><strong>操作日志</strong><small>管理员操作记录</small></span></Link>
        <Link className="admin-rail-link" to="/admin/notifications"><span className="admin-rail-icon"><Icon name="shield" /></span><span><strong>审核通知</strong><small>新的认证待办</small></span></Link>
        <div className="admin-rail-footer"><i />运行正常<span>INTERNAL CONSOLE</span></div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><span>平台治理</span><b>/</b><strong>企业认证</strong></div>
          <div className="admin-topbar-actions"><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={logout} title="退出登录" aria-label="退出登录"><Icon name="logout" /></button></div>
        </header>

        <main className="admin-content">
        <div className="admin-heading"><div><span className="admin-kicker">OPERATIONS / TRUST</span><h1>企业认证审核</h1><p>查看企业提交的资质资料，完成平台准入审核。</p></div><button className="admin-refresh" type="button" onClick={() => void loadApplications()} disabled={loading}><Icon name="refresh" />{loading ? '同步中' : '刷新队列'}</button></div>

        <section className="admin-stats" aria-label="审核统计">
          <div className="admin-stat"><small>待处理</small><strong>{counts.PENDING}</strong><span>需要你的判断</span></div>
          <div className="admin-stat"><small>已通过</small><strong>{counts.APPROVED}</strong><span>平台认证企业</span></div>
          <div className="admin-stat"><small>已驳回</small><strong>{counts.REJECTED}</strong><span>需要补充资料</span></div>
          <div className="admin-stat admin-stat-note"><Icon name="shield" /><span>审核记录由平台统一留痕</span></div>
        </section>

        {error && <div className="admin-error" role="alert">{error}</div>}

        <section className="admin-workspace">
          <div className="admin-queue-panel">
            <div className="admin-panel-heading"><div><span className="admin-kicker">APPLICATION QUEUE</span><h2>认证申请</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value as FilterStatus)} aria-label="筛选认证状态"><option value="PENDING">待审核</option><option value="ALL">全部申请</option><option value="APPROVED">已通过</option><option value="REJECTED">已驳回</option></select></div>
            {loading ? <div className="admin-empty">正在读取认证申请…</div> : visibleApplications.length === 0 ? <div className="admin-empty"><Icon name="file" /><strong>{filter === 'PENDING' ? '暂时没有待审核申请' : '没有符合条件的申请'}</strong><span>新的企业提交资料后会出现在这里。</span></div> : <div className="admin-queue-list">{visibleApplications.map((item) => {
              const certification = item.certification;
              return <button type="button" key={item.companyId} className={`admin-queue-item ${item.companyId === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(item.companyId)}><span className="admin-queue-icon"><Icon name="building" /></span><span className="admin-queue-copy"><strong>{certification.companyName || item.registeredCompanyName}</strong><small>{certification.contactName} · {certification.contactInfo}</small></span><span className={`admin-status ${certification.status.toLowerCase()}`}>{statusLabels[certification.status]}</span><span className="admin-queue-date">{dateLabel(certification.submittedAt)}</span><Icon name="arrow" /></button>;
            })}</div>}
          </div>

          <aside className="admin-detail-panel">
            {selected ? <>
              <div className="admin-detail-heading"><div><span className="admin-kicker">APPLICATION DETAIL</span><h2>{selected.certification.companyName}</h2><p>{selected.registeredCompanyName} · {selected.accountEmail || '未提供账号邮箱'}</p></div><span className={`admin-status ${selected.certification.status.toLowerCase()}`}>{statusLabels[selected.certification.status]}</span></div>
              <div className="admin-detail-grid"><div><small>联系人</small><strong>{selected.certification.contactName}</strong></div><div><small>联系方式</small><strong>{selected.certification.contactInfo}</strong></div><div><small>提交时间</small><strong>{dateLabel(selected.certification.submittedAt)}</strong></div><div><small>资料版本</small><strong>v{selected.certification.version}</strong></div></div>
              <div className="admin-detail-section"><small>服务范围</small><div className="admin-tags">{selected.certification.serviceAreas.length ? selected.certification.serviceAreas.map((area) => <span key={area}>{area}</span>) : <em>未填写</em>}</div></div>
              <div className="admin-detail-section"><small>认证材料</small><div className="admin-documents">{selected.certification.documentRefs.length ? selected.certification.documentRefs.map((document, index) => <div className="admin-document-row" key={document}><span><Icon name="file" />材料 {index + 1}</span><button type="button" onClick={() => void previewDocument(selected.companyId, document, index)} disabled={Boolean(openingDocument)}>{openingDocument === document ? '读取中…' : '查看材料'}</button></div>) : <em>企业尚未上传认证材料</em>}</div></div>
              {selected.certification.status === 'PENDING' ? <div className="admin-review"><label htmlFor="review-note">审核备注 <span>可选</span></label><textarea id="review-note" value={reviewNote} onChange={(event) => setReviewDraft({ companyId: selected.companyId, value: event.target.value })} maxLength={1000} placeholder="填写给企业的补充说明或通过备注" /><div className="admin-review-actions"><button type="button" className="admin-reject" disabled={reviewing} onClick={() => void decide('REJECTED')}>驳回申请</button><button type="button" className="admin-approve" disabled={reviewing} onClick={() => void decide('APPROVED')}>{reviewing ? '提交中…' : '通过认证'}</button></div></div> : <div className="admin-reviewed-note"><small>审核备注</small><p>{selected.certification.reviewNote || '本次审核未填写备注。'}</p></div>}
            </> : <div className="admin-empty admin-empty-detail"><Icon name="file" /><strong>选择一条申请</strong><span>从左侧队列打开企业认证资料。</span></div>}
          </aside>
        </section>
        </main>
      </div>
      {documentPreview && <div className="admin-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDocumentPreview(null); }}><section className="admin-preview-dialog" role="dialog" aria-modal="true" aria-label={documentPreview.name}><header><strong>{documentPreview.name}</strong><div><a href={documentPreview.url} download={documentPreview.name}>下载</a><button type="button" onClick={() => setDocumentPreview(null)}>关闭</button></div></header><div className="admin-preview-content">{documentPreview.type.startsWith('image/') ? <img src={documentPreview.url} alt={documentPreview.name} /> : documentPreview.type === 'application/pdf' ? <iframe src={documentPreview.url} title={documentPreview.name} /> : <p>该文件格式无法预览，请下载查看。</p>}</div></section></div>}
    </div>
  );
}
