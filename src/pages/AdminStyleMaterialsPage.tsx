import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDownload, apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import AdminWorkspaceTabs from '../components/AdminWorkspaceTabs';
import './AdminPage.css';
import './AdminStyleMaterialsPage.css';

type ReviewStatus = 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';
interface Candidate { id: string; candidateKey: string; styleKey: string; styleName: string; name: string; category: string; confidence: number; sourceImages: string[]; sourceRooms: string[]; brand: string | null; specification: string | null; unit: string | null; price: number | null; status: ReviewStatus; reviewNote: string | null; updatedAt: string }
interface CandidateExport { items?: Array<Partial<Candidate> & { id?: string; spec?: string; styleKeys?: string[] }>; }

const statusLabels: Record<ReviewStatus | 'ALL', string> = { ALL: '全部', NEEDS_REVIEW: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };
const emptyDraft = { brand: '', specification: '', unit: '', price: '', reviewNote: '' };

function dateLabel(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }

export default function AdminStyleMaterialsPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<ReviewStatus | 'ALL'>('NEEDS_REVIEW');
  const [styleKey, setStyleKey] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Candidate | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<{ item: Candidate; url: string; index: number } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ status });
      if (styleKey) params.set('styleKey', styleKey);
      if (query.trim()) params.set('query', query.trim());
      setItems(await apiRequest<Candidate[]>(`/api/v1/admin/style-material-review?${params}`));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '候选素材加载失败。'); }
  }, [query, status, styleKey]);

  useEffect(() => { void load(); }, [load]);

  const styles = useMemo(() => [...new Map(items.map((item) => [item.styleKey, item.styleName])).entries()], [items]);
  function logout() { signOut(); navigate('/admin/login', { replace: true }); }
  function openEditor(item: Candidate) { setEditing(item); setDraft({ brand: item.brand || '', specification: item.specification || '', unit: item.unit || '', price: item.price == null ? '' : String(item.price), reviewNote: item.reviewNote || '' }); setError(''); }

  async function importFile(file: File) {
    setBusy('import'); setError(''); setMessage('');
    try {
      const payload = JSON.parse(await file.text()) as CandidateExport;
      const candidates = (payload.items || []).map((item) => ({ ...item, candidateKey: item.candidateKey || item.id, styleKey: item.styleKey || item.styleKeys?.[0], specification: item.specification || item.spec })).filter((item) => item.candidateKey && item.styleKey && item.styleName && item.name && item.category).map((item) => ({ candidateKey: item.candidateKey, styleKey: item.styleKey, styleName: item.styleName, name: item.name, category: item.category, confidence: item.confidence ?? 0, sourceImages: item.sourceImages || [], sourceRooms: item.sourceRooms || [], brand: item.brand || null, specification: item.specification || null, unit: item.unit || null, price: item.price == null ? null : Number(item.price), reviewNote: item.reviewNote || null }));
      if (!candidates.length) throw new Error('JSON 中没有可导入的候选素材。');
      const count = await apiRequest<number>('/api/v1/admin/style-material-review/import', { method: 'POST', body: JSON.stringify({ items: candidates }) });
      setMessage(`已导入 ${count} 条候选素材，仍需补充商品信息后审核。`);
      await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '候选素材导入失败，请检查 JSON 文件。'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function openSourceImage(item: Candidate, index = 0) {
    setError('');
    try {
      const blob = await apiDownload(`/api/v1/admin/style-material-review/${item.id}/source-image?index=${index}`);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({ item, url: URL.createObjectURL(blob), index });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '来源图片读取失败。'); }
  }

  async function saveReview(nextStatus: ReviewStatus) {
    if (!editing) return;
    const price = draft.price.trim() === '' ? null : Number(draft.price);
    if (nextStatus === 'APPROVED' && (!draft.brand.trim() || !draft.specification.trim() || !draft.unit.trim() || price == null || !Number.isFinite(price) || price < 0)) { setError('通过审核前必须填写品牌、规格、单位和非负价格。'); return; }
    setBusy(editing.id); setError(''); setMessage('');
    try {
      await apiRequest<Candidate>(`/api/v1/admin/style-material-review/${editing.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus, brand: draft.brand, specification: draft.specification, unit: draft.unit, price, reviewNote: draft.reviewNote }) });
      setEditing(null); setMessage(nextStatus === 'APPROVED' ? '候选已通过审核，下一步可导入正式材料报价。' : nextStatus === 'REJECTED' ? '候选已驳回。' : '候选已保存。'); await load();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '审核结果保存失败。'); }
    finally { setBusy(''); }
  }

  return <div className="admin-page"><AdminSidebar /><div className="admin-stage"><AdminTopbar title="风格素材审核" onLogout={logout} /><main className="admin-content admin-style-material-content"><div className="admin-heading"><div><span className="admin-kicker">CONTENT / STYLE MATERIALS</span><h1>风格素材审核</h1></div><div className="admin-style-material-actions"><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /><button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>{busy === 'import' ? '导入中…' : '导入候选 JSON'}</button><button type="button" className="admin-refresh" onClick={() => void load()} disabled={Boolean(busy)}>刷新</button></div></div><AdminWorkspaceTabs group="content" />{error && <div className="admin-error" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}<section className="admin-style-material-toolbar"><label>审核状态<select value={status} onChange={(event) => setStatus(event.target.value as ReviewStatus | 'ALL')}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>风格<select value={styleKey} onChange={(event) => setStyleKey(event.target.value)}><option value="">全部风格</option>{styles.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="admin-style-material-search">搜索<input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="名称、品类或风格" /></label><button type="button" onClick={() => void load()}>筛选</button></section><section className="admin-style-material-panel"><header><div><span className="admin-kicker">REVIEW QUEUE</span><h2>候选素材 <small>{items.length}</small></h2></div><p>效果图识别只提供候选，审核通过前不会进入用户材料目录。</p></header>{!items.length ? <div className="admin-empty"><strong>暂无候选素材</strong><span>先导入 var/style-material-review-export.json，再逐条补充真实商品信息。</span></div> : <div className="admin-style-material-grid">{items.map((item) => <article className="admin-style-material-card" key={item.id}><div className="admin-style-material-card-head"><div><span className="admin-style-material-style">{item.styleName}</span><h3>{item.name}</h3></div><span className={`admin-status ${item.status.toLowerCase()}`}>{statusLabels[item.status]}</span></div><div className="admin-style-material-meta"><span>{item.category}</span><span>识别置信度 {(item.confidence * 100).toFixed(0)}%</span><span>{item.sourceRooms.join('、')}</span></div><p className="admin-style-material-source">来源：{item.sourceImages.length} 张参考图 · {item.sourceImages[0] || '未记录'}</p><div className="admin-style-material-card-actions"><button type="button" onClick={() => void openSourceImage(item)}>查看来源图</button><button type="button" onClick={() => openEditor(item)}>{item.status === 'NEEDS_REVIEW' ? '补充并审核' : '查看审核'}</button></div>{item.status === 'APPROVED' && <p className="admin-style-material-price">{item.brand} · {item.specification} · ¥{Number(item.price).toFixed(2)} / {item.unit}</p>}<footer><small>更新于 {dateLabel(item.updatedAt)}</small></footer></article>)}</div>}</section></main></div>{editing && <div className="admin-market-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setEditing(null); }}><section className="admin-market-dialog admin-style-material-dialog" role="dialog" aria-modal="true" aria-labelledby="style-material-edit-title"><header><div><span className="admin-kicker">REVIEW / {editing.styleName}</span><h2 id="style-material-edit-title">{editing.name}</h2></div><span className={`admin-status ${editing.status.toLowerCase()}`}>{statusLabels[editing.status]}</span></header><p className="admin-style-material-dialog-source">{editing.sourceImages.join('、')}</p><div className="admin-style-material-form"><label>品牌<input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="例如：某品牌" /></label><label>规格<input value={draft.specification} onChange={(event) => setDraft({ ...draft, specification: event.target.value })} placeholder="例如：三人位 / 1.8m" /></label><label>单位<input value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="件、套、盏" /></label><label>参考价格<input type="number" min="0" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="真实报价" /></label></div><label className="admin-style-material-note">审核备注<textarea value={draft.reviewNote} maxLength={1000} onChange={(event) => setDraft({ ...draft, reviewNote: event.target.value })} placeholder="记录来源核验、规格确认或驳回原因" /></label><div className="admin-style-material-dialog-actions"><button type="button" onClick={() => setEditing(null)} disabled={Boolean(busy)}>取消</button><button type="button" onClick={() => void saveReview('REJECTED')} disabled={Boolean(busy)}>驳回</button><button type="button" className="primary" onClick={() => void saveReview('APPROVED')} disabled={Boolean(busy)}>{busy ? '保存中…' : '通过审核'}</button></div></section></div>}{preview && <div className="admin-market-backdrop admin-style-material-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { URL.revokeObjectURL(preview.url); setPreview(null); } }}><section className="admin-style-material-preview" role="dialog" aria-modal="true" aria-label={`${preview.item.name}来源图片`}><header><strong>{preview.item.styleName} · {preview.item.name}</strong><button type="button" aria-label="关闭图片预览" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null); }}>×</button></header><img src={preview.url} alt={`${preview.item.name}效果图来源`} /><footer><span>{preview.index + 1} / {preview.item.sourceImages.length}</span><button type="button" disabled={preview.index <= 0} onClick={() => void openSourceImage(preview.item, preview.index - 1)}>上一张</button><button type="button" disabled={preview.index >= preview.item.sourceImages.length - 1} onClick={() => void openSourceImage(preview.item, preview.index + 1)}>下一张</button></footer></section></div>}</div>;
}
