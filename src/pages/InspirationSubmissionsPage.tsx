import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { deleteSubmission, listMySubmissions, updateSubmission, uploadSubmission, type InspirationSubmission } from '../services/inspirationSubmissions';
import './InspirationSubmissionsPage.css';

const statusLabels = { PENDING: '审核中', APPROVED: '已发布', REJECTED: '已驳回' } as const;

export default function InspirationSubmissionsPage() {
  const [items, setItems] = useState<InspirationSubmission[]>([]);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<InspirationSubmission | null>(null);

  async function load() {
    try { setItems(await listMySubmissions()); }
    catch (e) { setError(e instanceof Error ? e.message : '投稿记录加载失败'); }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setMessage('');
    if (!title.trim() || !style.trim() || (!editingId && files.length === 0)) { setError('请填写标题、风格并至少选择一张图片。'); return; }
    setBusy(true);
    try {
      if (editingId) await updateSubmission(editingId, { title, style, description, area });
      else await uploadSubmission({ title, style, description, area, images: files });
      setTitle(''); setStyle(''); setDescription(''); setArea(''); setFiles([]);
      const input = document.getElementById('submission-images') as HTMLInputElement | null;
      if (input) input.value = '';
      setShowUpload(false); setEditingId(null); setMessage(editingId ? '修改已保存，正在重新审核。' : '已提交，管理员审核通过后会展示在灵感广场。'); await load();
    } catch (e) { setError(e instanceof Error ? e.message : '投稿提交失败'); }
    finally { setBusy(false); }
  }

  function startEditing(item: InspirationSubmission) {
    setEditingId(item.id);
    setTitle(item.title);
    setStyle(item.style);
    setDescription(item.description || '');
    setArea(item.area == null ? '' : String(item.area));
    setFiles([]);
    setError('');
    setShowUpload(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      await deleteSubmission(deleteTarget.id);
      setMessage(`“${deleteTarget.title}”已删除。`);
      setDeleteTarget(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : '投稿删除失败'); }
    finally { setBusy(false); }
  }

  const visibleItems = items.filter((item) => `${item.title} ${item.style} ${item.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const uploadForm = <form className="submission-form" onSubmit={submit}>
    <div className="submission-form-heading"><span>{editingId ? 'EDIT SUBMISSION' : 'NEW SUBMISSION'}</span><h2>{editingId ? '编辑装修方案' : '上传装修方案'}</h2></div>
    <label>方案名称<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="例如：暖木色三居室" /></label>
    <label>装修风格<input value={style} onChange={(e) => setStyle(e.target.value)} maxLength={80} placeholder="例如：现代简约" /></label>
    <div className="submission-form-grid"><label>面积（㎡）<input type="number" min="0" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} /></label><label>方案图片{editingId ? <small>编辑资料不会更改已上传的图片</small> : <><input id="submission-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 8))} /><small>{files.length ? `已选择 ${files.length} 张图片` : '最多 8 张，单张不超过 15 MB'}</small></>}</label></div>
    <label>方案说明<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5} placeholder="介绍空间特点、材料或设计想法" /></label>
    {error && <p className="submission-error">{error}</p>}
    <div className="submission-form-actions"><button type="button" className="submission-cancel" onClick={() => { setShowUpload(false); setEditingId(null); }} disabled={busy}>取消</button><button type="submit" disabled={busy}>{busy ? '保存中…' : editingId ? '保存修改' : '提交审核'}</button></div>
  </form>;

  return <div className="submission-page">
    <header className="submission-header"><div><span>INSPIRATION SQUARE</span><h1>我的投稿</h1><p>管理你分享的装修方案，审核通过后会展示给其他用户。</p></div><div className="submission-header-actions"><Link to="/inspiration">返回灵感广场</Link><button type="button" onClick={() => { setEditingId(null); setError(''); setShowUpload(true); }}>上传装修方案</button></div></header>
    {message && <p className="submission-success submission-page-message">{message}</p>}
    {error && !showUpload && <p className="submission-error submission-page-message">{error}</p>}
    <main className="submission-layout"><section className="submission-history"><label className="submission-search"><span>查询投稿</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索方案名称、风格或说明" /></label>{!items.length ? <div className="submission-empty">还没有投稿记录，点击右上角上传你的第一个方案吧。</div> : !visibleItems.length ? <div className="submission-empty">没有找到匹配的投稿。</div> : <><div className="submission-list-head"><span>方案</span><span>状态</span><span>说明</span><span>更新时间</span><span>操作</span></div>{visibleItems.map((item) => <article key={item.id}><div className="submission-item-head"><div className="submission-item-title"><strong>{item.title}</strong><span>{item.style}{item.area ? ` · ${item.area}㎡` : ''}</span></div></div><em className={item.status.toLowerCase()}>{statusLabels[item.status]}</em><p>{item.description || '未填写方案说明'}</p><small>{new Date(item.updatedAt).toLocaleString('zh-CN')}{item.reviewNote ? ` · ${item.reviewNote}` : ''}</small><div className="submission-row-actions"><button type="button" className="submission-edit-button" onClick={() => startEditing(item)}>编辑</button><button type="button" className="submission-delete-button" onClick={() => setDeleteTarget(item)}>删除</button></div></article>)}</>}</section></main>
    {showUpload && <div className="submission-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setShowUpload(false); setEditingId(null); } }}><section className="submission-modal" role="dialog" aria-modal="true" aria-labelledby="submission-modal-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="submission-modal-close" onClick={() => { setShowUpload(false); setEditingId(null); }} aria-label="关闭上传窗口">×</button><div id="submission-modal-title">{uploadForm}</div></section></div>}
    {deleteTarget && <div className="submission-modal-backdrop" role="presentation"><section className="submission-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="submission-delete-title"><div className="submission-form-heading"><span>DELETE SUBMISSION</span><h2 id="submission-delete-title">确认删除投稿？</h2></div><p>“{deleteTarget.title}”及其图片将被永久删除。</p><div className="submission-form-actions"><button type="button" className="submission-cancel" onClick={() => setDeleteTarget(null)} disabled={busy}>取消</button><button type="button" className="submission-delete-confirm" onClick={() => void confirmDelete()} disabled={busy}>{busy ? '删除中…' : '确认删除'}</button></div></section></div>}
  </div>;
}
