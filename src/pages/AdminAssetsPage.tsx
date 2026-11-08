import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiDownload, apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import './AdminPage.css';
import './AdminAssetsPage.css';

interface CleanupCandidate {
  companyId: string;
  companyName: string;
  assetId: string;
  fileName: string;
  objectKey: string;
  uploadedAt: string;
  byteSize: number;
}

interface CleanupPreview {
  eligibleImageCount: number;
  estimatedBytes: number;
  cutoffAt: string;
  generatedAt: string;
  candidates: CleanupCandidate[];
  remainingImageCount: number;
}

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

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function storageSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function AdminAssetsPage() {
  const pageSize = 20;
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const [imagePreview, setImagePreview] = useState<{ url: string; fileName: string } | null>(null);
  const [openingImage, setOpeningImage] = useState('');

  async function loadPreview() {
    setLoading(true);
    setError('');
    try {
      const result = await apiRequest<CleanupPreview>('/api/v1/admin/assets/cleanup-preview');
      setPreview(result);
      setPage((current) => Math.min(current, Math.max(0, Math.ceil(result.candidates.length / pageSize) - 1)));
      setSelectedIds((current) => current.filter((id) => result.candidates.some((candidate) => candidate.assetId === id)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '清理候选图片读取失败。');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void Promise.resolve().then(loadPreview); }, []);

  const pageCandidates = useMemo(() => preview?.candidates.slice(page * pageSize, (page + 1) * pageSize) || [], [page, preview]);
  const pageAllSelected = pageCandidates.length > 0 && pageCandidates.every((candidate) => selectedIds.includes(candidate.assetId));
  const selectedBytes = useMemo(() => preview?.candidates
    .filter((candidate) => selectedIds.includes(candidate.assetId))
    .reduce((total, candidate) => total + candidate.byteSize, 0) || 0, [preview, selectedIds]);

  function toggleAsset(assetId: string) {
    setSelectedIds((current) => current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId]);
  }

  function togglePage() {
    setSelectedIds((current) => pageAllSelected
      ? current.filter((id) => !pageCandidates.some((candidate) => candidate.assetId === id))
      : [...new Set([...current, ...pageCandidates.map((candidate) => candidate.assetId)])]);
  }

  useEffect(() => {
    let active = true;
    const createdUrls: string[] = [];
    void Promise.all(pageCandidates.map(async (candidate) => {
      try {
        const blob = await apiDownload(`/api/v1/admin/assets/cleanup-preview/${candidate.assetId}/image`);
        const url = URL.createObjectURL(blob);
        createdUrls.push(url);
        return [candidate.assetId, url] as const;
      } catch {
        return null;
      }
    })).then((entries) => {
      if (active) setThumbnailUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)));
      else createdUrls.forEach((url) => URL.revokeObjectURL(url));
    });
    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pageCandidates]);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview.url);
  }, [imagePreview]);

  async function openImage(candidate: CleanupCandidate) {
    setOpeningImage(candidate.assetId);
    setError('');
    try {
      const blob = await apiDownload(`/api/v1/admin/assets/cleanup-preview/${candidate.assetId}/image`);
      setImagePreview({ url: URL.createObjectURL(blob), fileName: candidate.fileName });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图片读取失败。');
    } finally {
      setOpeningImage('');
    }
  }

  async function cleanSelected() {
    if (!selectedIds.length || cleaning) return;
    const confirmed = window.confirm(`确认清理选中的 ${selectedIds.length} 张图片（列表文件约 ${storageSize(selectedBytes)}）？此操作不可撤销。`);
    if (!confirmed) return;
    setCleaning(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest<{ removedImageCount: number }>('/api/v1/admin/assets/cleanup', {
        method: 'POST',
        body: JSON.stringify({ assetIds: selectedIds }),
      });
      setNotice(`已清理 ${result.removedImageCount} 张图片。`);
      setSelectedIds([]);
      await loadPreview();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '图片清理失败，请刷新后重试。');
    } finally {
      setCleaning(false);
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
        <Link className="admin-rail-link" to="/admin"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业认证</strong><small>准入审核队列</small></span></Link>
        <Link className="admin-rail-link" to="/admin/marketplace"><span className="admin-rail-icon"><Icon name="building" /></span><span><strong>企业与材料</strong><small>企业状态与公开报价</small></span></Link>
        <Link className="admin-rail-current" aria-current="page" to="/admin/assets"><span className="admin-rail-icon"><Icon name="file" /></span><span><strong>图片清理</strong><small>未关联图片管理</small></span></Link>
        <Link className="admin-rail-link" to="/admin/audit"><span className="admin-rail-icon"><Icon name="shield" /></span><span><strong>操作日志</strong><small>管理员操作记录</small></span></Link>
        <div className="admin-rail-footer"><i />运行正常<span>INTERNAL CONSOLE</span></div>
      </aside>

      <div className="admin-stage">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><span>平台治理</span><b>/</b><strong>图片清理</strong></div>
          <div className="admin-topbar-actions"><span className="admin-role">平台管理员</span><button className="admin-icon-button" type="button" onClick={logout} title="退出登录" aria-label="退出登录"><Icon name="logout" /></button></div>
        </header>

        <main className="admin-content">
          <div className="admin-heading"><div><span className="admin-kicker">STORAGE / CLEANUP</span><h1>未关联图片清理</h1><p>检查超过 7 天且未关联业务资料的企业图片。</p></div><button className="admin-refresh" type="button" onClick={() => void loadPreview()} disabled={loading || cleaning}><Icon name="refresh" />{loading ? '读取中' : '重新检查'}</button></div>

          {preview && <section className="admin-cleanup-stats" aria-label="图片清理统计">
            <div><small>符合条件</small><strong>{preview.eligibleImageCount}</strong><span>张图片总数</span></div>
            <div><small>列表占用</small><strong>{storageSize(preview.estimatedBytes)}</strong><span>最多展示前 500 张</span></div>
            <div><small>清理时间范围</small><strong>早于 {dateLabel(preview.cutoffAt)}</strong><span>预览更新于 {dateLabel(preview.generatedAt)}</span></div>
          </section>}

          {error && <div className="admin-error" role="alert">{error}</div>}
          {notice && <div className="admin-success" role="status">{notice}</div>}

          <section className="admin-assets-panel">
            <div className="admin-assets-toolbar"><div><span className="admin-kicker">ORPHANED IMAGES</span><h2>待清理文件</h2></div><div className="admin-assets-actions"><span>{selectedIds.length ? `已选 ${selectedIds.length} 张 · ${storageSize(selectedBytes)}` : '清理前会再次校验引用状态'}</span><button className="admin-clean-button" type="button" onClick={() => void cleanSelected()} disabled={!selectedIds.length || cleaning}>{cleaning ? '正在清理…' : '清理所选'}</button></div></div>
            {preview?.remainingImageCount ? <div className="admin-list-limit">当前展示前 500 张，另有 {preview.remainingImageCount} 张符合条件。</div> : null}
            {loading ? <div className="admin-empty">正在检查上传图片…</div> : !preview?.candidates.length ? <div className="admin-empty"><Icon name="file" /><strong>没有待清理图片</strong><span>未关联且超过 7 天的图片会显示在这里。</span></div> : <><div className="admin-assets-table-wrap"><table className="admin-assets-table"><thead><tr><th><input type="checkbox" aria-label="选择本页全部图片" checked={pageAllSelected} onChange={togglePage} /></th><th>图片预览</th><th>文件名</th><th>所属企业</th><th>上传时间</th><th>文件大小</th></tr></thead><tbody>{pageCandidates.map((candidate) => <tr key={candidate.assetId}><td><input type="checkbox" aria-label={`选择 ${candidate.fileName}`} checked={selectedIds.includes(candidate.assetId)} onChange={() => toggleAsset(candidate.assetId)} /></td><td><button className="admin-thumb-button" type="button" title={`查看 ${candidate.fileName}`} onClick={() => void openImage(candidate)} disabled={openingImage === candidate.assetId}>{thumbnailUrls[candidate.assetId] ? <img src={thumbnailUrls[candidate.assetId]} alt={candidate.fileName} /> : <span>{openingImage === candidate.assetId ? '读取中' : '预览'}</span>}</button></td><td><span className="admin-asset-file"><span><strong>{candidate.fileName}</strong><small>{candidate.assetId}</small></span></span></td><td>{candidate.companyName}</td><td>{dateLabel(candidate.uploadedAt)}</td><td>{storageSize(candidate.byteSize)}</td></tr>)}</tbody></table></div><div className="admin-assets-pagination"><span>第 {page + 1} / {Math.max(1, Math.ceil(preview.candidates.length / pageSize))} 页 · 当前列表 {preview.candidates.length} 张</span><div><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>上一页</button><button type="button" onClick={() => setPage((current) => Math.min(Math.ceil((preview?.candidates.length || 0) / pageSize) - 1, current + 1))} disabled={(page + 1) * pageSize >= preview.candidates.length}>下一页</button></div></div></>}
          </section>
        </main>
      </div>
      {imagePreview && <div className="admin-image-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImagePreview(null); }}><section className="admin-image-dialog" role="dialog" aria-modal="true" aria-label={imagePreview.fileName}><header><strong>{imagePreview.fileName}</strong><button type="button" onClick={() => setImagePreview(null)} aria-label="关闭图片预览">关闭</button></header><div><img src={imagePreview.url} alt={imagePreview.fileName} /></div></section></div>}
    </div>
  );
}
