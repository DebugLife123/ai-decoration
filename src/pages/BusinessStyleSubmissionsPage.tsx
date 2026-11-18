import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { businessDataAdapter } from '../services/businessData';
import type { MaterialRecord } from '../services/dataContracts';
import { loadStyleDirectory, type PlatformStyleCatalogItem } from '../services/styleDirectory';
import { listBusinessStyleSubmissions, uploadBusinessStyleSubmission, updateBusinessStyleSubmission, deleteBusinessStyleSubmission, type InspirationSubmission } from '../services/inspirationSubmissions';
import './BusinessStyleSubmissionsPage.css';
import './InspirationSubmissionsPage.css';

const statusLabels = { PENDING: '审核中', APPROVED: '已发布', REJECTED: '已驳回' } as const;

export default function BusinessStyleSubmissionsPage() {
  const [items, setItems] = useState<InspirationSubmission[]>([]);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [styles, setStyles] = useState<PlatformStyleCatalogItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('');
  const [description, setDescription] = useState('');
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<InspirationSubmission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspirationSubmission | null>(null);
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    try { setItems(await listBusinessStyleSubmissions()); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '投稿记录加载失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void Promise.all([
      listBusinessStyleSubmissions().then(setItems).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '投稿记录加载失败')).finally(() => setLoading(false)),
      businessDataAdapter.loadMaterials().then(setMaterials).catch(() => setMaterials([])),
      loadStyleDirectory().then((value) => { setStyles(value); if (value[0]) setStyle(value[0].styleKey); }).catch(() => undefined),
    ]);
  }, []);

  function resetForm() {
    setTitle(''); setDescription(''); setMaterialIds([]); setFiles([]); setShowForm(false); setEditing(null);
    const input = document.getElementById('business-style-images') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !style || (!editing && files.length === 0)) { setError('请填写模板名称、选择风格并至少上传一张效果图。'); return; }
    if (files.some((file) => file.size > 15 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 15 * 1024 * 1024) { setError('单次投稿图片总计不能超过 15 MB，请压缩图片后重试。'); return; }
    if (materialIds.length > 20) { setError('最多关联 20 项材料。'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (editing) await updateBusinessStyleSubmission(editing.id, { title, style, description, materialIds });
      else await uploadBusinessStyleSubmission({ title, style, description, materialIds, images: files });
      resetForm(); setMessage('风格模板已提交，管理员审核通过后会展示在灵感广场。'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '风格模板提交失败'); }
    finally { setBusy(false); }
  }

  function startEditing(item: InspirationSubmission) {
    setEditing(item); setTitle(item.title); setStyle(item.style); setDescription(item.description || '');
    setMaterialIds(item.materials.map((material) => material.id)); setFiles([]); setError(''); setShowForm(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true); setError('');
    try { await deleteBusinessStyleSubmission(deleteTarget.id); setDeleteTarget(null); setMessage('风格模板已删除。'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '删除失败'); }
    finally { setBusy(false); }
  }

  const visibleItems = items.filter((item) => `${item.title} ${item.style} ${item.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const openCreate = () => { setEditing(null); setTitle(''); setDescription(''); setMaterialIds([]); setFiles([]); setStyle(styles[0]?.styleKey || ''); setError(''); setMessage(''); setShowForm(true); };

  return <div className="submission-page business-submission-page">
    <header className="submission-header"><div><span>BUSINESS / INSPIRATION</span><h1>风格模板投稿</h1><p>上传企业已完成的风格方案，关联报价后提交平台审核。</p></div><div className="submission-header-actions"><Link to="/business">返回企业工作区</Link><button type="button" onClick={openCreate}>新增投稿</button></div></header>
    {message && <p className="submission-success submission-page-message">{message}</p>}
    {error && !showForm && !deleteTarget && <p className="submission-error submission-page-message">{error}</p>}
    <main className="submission-layout"><section className="submission-history">
      <div className="submission-history-heading"><div className="submission-form-heading"><span>SUBMISSION HISTORY</span><h2>我的风格模板</h2></div><strong>{items.length} 条</strong></div>
      <label className="submission-search"><span>查询投稿</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板名称、风格或说明" /></label>
      {loading ? <div className="submission-empty">正在读取投稿记录…</div> : !items.length ? <div className="submission-empty">还没有投稿记录，点击右上角新增一条风格模板吧。</div> : !visibleItems.length ? <div className="submission-empty">没有找到匹配的投稿。</div> : <><div className="submission-list-head"><span>模板</span><span>状态</span><span>说明</span><span>更新时间</span><span>操作</span></div>{visibleItems.map((item) => <article key={item.id}><div className="submission-item-head"><div className="submission-item-title"><strong>{item.title}</strong><span>{styles.find((entry) => entry.styleKey === item.style)?.styleName || item.style}{item.materials.length ? ` · 已关联 ${item.materials.length} 项材料` : ''}</span></div></div><em className={item.status.toLowerCase()}>{statusLabels[item.status]}</em><p>{item.description || '未填写模板说明'}{item.reviewNote ? ` · 审核备注：${item.reviewNote}` : ''}</p><small>{new Date(item.updatedAt).toLocaleString('zh-CN')}</small><div className="submission-row-actions"><button type="button" className="submission-edit-button" onClick={() => startEditing(item)}>编辑</button><button type="button" className="submission-delete-button" onClick={() => setDeleteTarget(item)}>删除</button></div></article>)}</>}
    </section></main>
    {showForm && <div className="submission-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) resetForm(); }}><section className="submission-modal" role="dialog" aria-modal="true" aria-labelledby="business-style-submission-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="submission-modal-close" disabled={busy} onClick={resetForm} aria-label="关闭上传窗口">×</button><form className="submission-form" onSubmit={(event) => void submit(event)}><fieldset disabled={busy} className="business-style-form-fields"><div className="submission-form-heading"><span>{editing ? 'EDIT STYLE TEMPLATE' : 'NEW STYLE TEMPLATE'}</span><h2 id="business-style-submission-title">{editing ? '编辑风格模板' : '新增风格模板'}</h2></div><label>模板名称<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="例如：暖木中古客厅" /></label><label>平台风格<select value={style} onChange={(event) => setStyle(event.target.value)}><option value="">请选择风格</option>{styles.map((item) => <option key={item.styleKey} value={item.styleKey}>{item.styleName}</option>)}</select></label><label>效果图{editing ? <small>保留已上传的 {editing.images.length} 张图片；保存后重新审核。</small> : <><input id="business-style-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" multiple onChange={(event) => { const selected = Array.from(event.target.files || []); if (selected.length > 8) { setError('最多上传 8 张图片。'); event.target.value = ''; setFiles([]); } else { setFiles(selected); setError(''); } }} /><small>{files.length ? `已选择 ${files.length} 张` : '最多 8 张，图片总计不超过 15 MB'}</small></>}</label><label>模板说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} placeholder="介绍空间特点、材料搭配和设计思路" /></label><fieldset className="business-style-material-fieldset"><legend>关联企业材料（可选）</legend><div className="business-style-material-options">{materials.length ? materials.map((material) => <label key={material.id}><input type="checkbox" checked={materialIds.includes(material.id)} onChange={(event) => setMaterialIds((current) => event.target.checked ? [...current, material.id] : current.filter((id) => id !== material.id))} /><span>{material.name}<small>{material.brand || '未填写品牌'} · {material.price}{material.unit}</small></span></label>) : <small>还没有企业材料报价。</small>}</div></fieldset>{error && <p className="submission-error">{error}</p>}</fieldset><div className="submission-form-actions"><button type="button" className="submission-cancel" onClick={resetForm} disabled={busy}>取消</button><button type="submit" disabled={busy}>{busy ? '提交中…' : editing ? '保存并重新审核' : '提交审核'}</button></div></form></section></div>}
    {deleteTarget && <div className="submission-modal-backdrop" role="presentation"><section className="submission-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="business-style-delete-title"><div className="submission-form-heading"><span>DELETE STYLE TEMPLATE</span><h2 id="business-style-delete-title">确认删除模板？</h2></div><p>“{deleteTarget.title}”及其效果图将被删除，已发布内容也将移出灵感广场。</p>{error && <p className="submission-error">{error}</p>}<div className="submission-form-actions"><button type="button" className="submission-cancel" disabled={busy} onClick={() => setDeleteTarget(null)}>取消</button><button type="button" className="submission-delete-confirm" disabled={busy} onClick={() => void confirmDelete()}>{busy ? '删除中…' : '确认删除'}</button></div></section></div>}
  </div>;
}
