import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/authSession';
import { useAppStore } from '../stores/appStore';
import AdminSidebar from '../components/AdminSidebar';
import AdminTopbar from '../components/AdminTopbar';
import { clearStyleDirectoryCache } from '../services/styleDirectory';
import './AdminPage.css';
import './AdminBudgetSettingsPage.css';

type Group = 'STYLE' | 'MATERIAL_GRADE' | 'REGION';
interface Coefficient { coefficientGroup: Group; coefficientCode: string; label: string; factor: number; updatedAt: string; updatedBy: string | null }
interface StylePriceRange { styleCode: string; styleName: string; priceLowPerSqm: number | null; priceHighPerSqm: number | null; materialFactor: number }
interface StylePrompt { styleKey: string; styleName: string; prompt: string; updatedAt: string }
interface StyleCatalogItem { styleKey: string; styleName: string; prompt: string; priceLowPerSqm: number | null; priceHighPerSqm: number | null; materialFactor: number }
const groupLabels: Record<Group, string> = { REGION: '地区价格', MATERIAL_GRADE: '材料档次', STYLE: '风格模板' };
const stylePromptKeyByBudgetCode: Record<string, string> = { 'modern-minimal': 'modern', 'wood-cream': 'minimal', 'mid-century': 'mid-century', bauhaus: 'bauhaus', 'small-american': 'smallAmerican', 'french-natural': 'cream', song: 'song', 'italian-minimal': 'italian-minimal', 'old-money': 'european', chinese: 'chinese', wabi: 'wabi' };
const budgetCodeByPromptKey: Record<string, string> = Object.fromEntries(Object.entries(stylePromptKeyByBudgetCode).map(([budgetCode, promptKey]) => [promptKey, budgetCode]));

export default function AdminBudgetSettingsPage() {
  const navigate = useNavigate();
  const signOut = useAppStore((state) => state.signOut);
  const [items, setItems] = useState<Coefficient[]>([]);
  const [stylePrompts, setStylePrompts] = useState<StylePrompt[]>([]);
  const [styleCatalog, setStyleCatalog] = useState<StyleCatalogItem[]>([]);
  const [showCreateStyle, setShowCreateStyle] = useState(false);
  const [editingStyle, setEditingStyle] = useState<StyleCatalogItem | null>(null);
  const [deletingStyle, setDeletingStyle] = useState<StyleCatalogItem | null>(null);
  const [newStyle, setNewStyle] = useState({ styleKey: '', styleName: '', prompt: '', priceLowPerSqm: '', priceHighPerSqm: '', materialFactor: '1' });
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<string, { low: string; high: string }>>({});
  const [styleFactorDrafts, setStyleFactorDrafts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    setError('');
    try {
      const [result, catalog] = await Promise.all([
        apiRequest<Coefficient[]>('/api/v1/admin/budget-coefficients'),
        apiRequest<StyleCatalogItem[]>('/api/v1/admin/design-style-prompts/catalog'),
      ]);
      const prompts = await apiRequest<StylePrompt[]>('/api/v1/admin/design-style-prompts');
      setItems(result);
      setDrafts(Object.fromEntries(result.map((item) => [`${item.coefficientGroup}:${item.coefficientCode}`, String(item.factor)])));
      setStyleCatalog(catalog);
      setStylePrompts(prompts);
      setPromptDrafts(Object.fromEntries(prompts.map((item) => [item.styleKey, item.prompt])));
      setPriceDrafts(Object.fromEntries(catalog.map((item) => [item.styleKey, { low: item.priceLowPerSqm == null ? '' : String(item.priceLowPerSqm), high: item.priceHighPerSqm == null ? '' : String(item.priceHighPerSqm) }])));
      setStyleFactorDrafts(Object.fromEntries(catalog.map((item) => [item.styleKey, String(item.materialFactor ?? 1)])));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '预算系数加载失败。'); }
  }
  function openStyleEditor(item: StyleCatalogItem) {
    const promptKey = stylePromptKeyByBudgetCode[item.styleKey] ?? item.styleKey;
    const prompt = stylePrompts.find((entry) => entry.styleKey === promptKey);
    setPriceDrafts((current) => ({ ...current, [item.styleKey]: { low: item.priceLowPerSqm == null ? '' : String(item.priceLowPerSqm), high: item.priceHighPerSqm == null ? '' : String(item.priceHighPerSqm) } }));
    setStyleFactorDrafts((current) => ({ ...current, [item.styleKey]: String(item.materialFactor ?? 1) }));
    if (prompt) setPromptDrafts((current) => ({ ...current, [prompt.styleKey]: current[prompt.styleKey] ?? prompt.prompt }));
    setEditingStyle(item);
  }
  async function saveStyle(item: StyleCatalogItem) {
    const styleCode = item.styleKey;
    const draft = priceDrafts[styleCode];
    const low = Number(draft?.low);
    const high = Number(draft?.high);
    const materialFactor = Number(styleFactorDrafts[styleCode]);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 100 || high < low || high > 10000) { setError('风格单价需在 100–10000 元/㎡之间，最高价不能低于最低价。'); return; }
    if (!Number.isFinite(materialFactor) || materialFactor < 0.5 || materialFactor > 2) { setError('材料参考系数需在 0.5–2.0 之间。'); return; }
    const promptKey = stylePromptKeyByBudgetCode[styleCode] ?? styleCode;
    const prompt = stylePrompts.find((entry) => entry.styleKey === promptKey);
    const promptValue = prompt ? (promptDrafts[prompt.styleKey] ?? prompt.prompt).trim() : '';
    if (prompt && (!promptValue || promptValue.length > 12000)) { setError('风格提示词不能为空且不能超过 12000 个字符。'); return; }
    const key = `PRICE:${styleCode}`;
    setSaving(key); setError(''); setMessage('');
    try {
      const budgetCode = budgetCodeByPromptKey[styleCode] ?? styleCode;
      const updated = await apiRequest<StylePriceRange>(`/api/v1/admin/budget-style-prices/${encodeURIComponent(budgetCode)}`, { method: 'PUT', body: JSON.stringify({ priceLowPerSqm: low, priceHighPerSqm: high, materialFactor }) });
      setStyleCatalog((current) => current.map((entry) => entry.styleKey === styleCode ? { ...entry, priceLowPerSqm: updated.priceLowPerSqm, priceHighPerSqm: updated.priceHighPerSqm, materialFactor: updated.materialFactor } : entry));
      setPriceDrafts((current) => ({ ...current, [styleCode]: { low: String(updated.priceLowPerSqm), high: String(updated.priceHighPerSqm) } }));
      setStyleFactorDrafts((current) => ({ ...current, [styleCode]: String(updated.materialFactor) }));
      if (prompt) {
        const updatedPrompt = await apiRequest<StylePrompt>(`/api/v1/admin/design-style-prompts/${encodeURIComponent(prompt.styleKey)}`, { method: 'PUT', body: JSON.stringify({ prompt: promptValue }) });
        setStylePrompts((current) => current.map((entry) => entry.styleKey === prompt.styleKey ? updatedPrompt : entry));
        setPromptDrafts((current) => ({ ...current, [prompt.styleKey]: updatedPrompt.prompt }));
      }
      setEditingStyle(null);
      setMessage(`${item.styleName}的预算区间、材料系数和提示词已保存，新的预算试算与生图任务会立即使用。`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '风格配置保存失败。'); }
    finally { setSaving(''); }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);
  const groups = useMemo(() => (['REGION', 'MATERIAL_GRADE', 'STYLE'] as Group[]).map((group) => ({ group, items: items.filter((item) => item.coefficientGroup === group) })), [items]);
  const mergedStylePrices = useMemo(() => styleCatalog.map((item) => ({ ...item, styleCode: item.styleKey, materialFactor: item.materialFactor ?? 1 })), [styleCatalog]);
  async function createStyle(event: React.FormEvent) {
    event.preventDefault();
    const body = { styleKey: newStyle.styleKey.trim(), styleName: newStyle.styleName.trim(), prompt: newStyle.prompt.trim(), priceLowPerSqm: Number(newStyle.priceLowPerSqm), priceHighPerSqm: Number(newStyle.priceHighPerSqm), materialFactor: Number(newStyle.materialFactor) };
    if (!body.styleKey || !body.styleName || !body.prompt || !Number.isFinite(body.priceLowPerSqm) || !Number.isFinite(body.priceHighPerSqm)) { setError('请填写风格代码、名称、提示词和预算区间。'); return; }
    setSaving('CREATE_STYLE'); setError(''); setMessage('');
    try {
      await apiRequest<StyleCatalogItem>('/api/v1/admin/design-style-prompts', { method: 'POST', body: JSON.stringify(body) });
      clearStyleDirectoryCache();
      setNewStyle({ styleKey: '', styleName: '', prompt: '', priceLowPerSqm: '', priceHighPerSqm: '', materialFactor: '1' });
      setShowCreateStyle(false);
      await load();
      setMessage(`${body.styleName}已新增，用户预算、企业风格资料和效果图生成端已可读取。`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '新增风格失败。'); }
    finally { setSaving(''); }
  }
  async function deleteStyle() {
    if (!deletingStyle) return;
    const target = deletingStyle;
    const key = `DELETE:${target.styleKey}`;
    setSaving(key); setError(''); setMessage('');
    try {
      await apiRequest<boolean>(`/api/v1/admin/design-style-prompts/${encodeURIComponent(target.styleKey)}`, { method: 'DELETE' });
      clearStyleDirectoryCache();
      setStyleCatalog((current) => current.filter((item) => item.styleKey !== target.styleKey));
      setStylePrompts((current) => current.filter((item) => item.styleKey !== target.styleKey));
      setDeletingStyle(null);
      setMessage(`${target.styleName}已删除，预算区间、材料系数和风格材料参考也已移除。`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '删除风格失败。'); }
    finally { setSaving(''); }
  }
  async function save(item: Coefficient) {
    const key = `${item.coefficientGroup}:${item.coefficientCode}`;
    const factor = Number(drafts[key]);
    if (!Number.isFinite(factor) || factor < 0.5 || factor > 2) { setError('系数必须在 0.5 至 2.0 之间。'); return; }
    setSaving(key); setError(''); setMessage('');
    try {
      const updated = await apiRequest<Coefficient>(`/api/v1/admin/budget-coefficients/${item.coefficientGroup}/${encodeURIComponent(item.coefficientCode)}`, { method: 'PUT', body: JSON.stringify({ factor }) });
      setItems((current) => current.map((entry) => entry.coefficientGroup === item.coefficientGroup && entry.coefficientCode === item.coefficientCode ? updated : entry));
      setMessage(`${item.label}已更新，新的预算试算会立即使用。`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : '预算系数保存失败。'); }
    finally { setSaving(''); }
  }
  function logout() {
    signOut();
    navigate('/login', { replace: true });
  }

  return <div className="admin-page">
    <AdminSidebar />
    <div className="admin-stage">
      <AdminTopbar title="风格与预算" onLogout={logout} />
      <main className="admin-content admin-budget-content">
        <div className="admin-heading"><div><span className="admin-kicker">OPERATIONS / STYLE & BUDGET</span><h1>风格与预算配置</h1></div></div>
        {error && <p className="budget-settings-error" role="alert">{error}</p>}{message && <p className="budget-settings-success">{message}</p>}
        <div className="budget-settings-notice">在此统一管理效果图风格提示词、风格预算区间和地区/材料系数。提示词修改仅影响新发起的生成任务；系数范围限制为 0.5–2.0，修改会记录到管理员操作日志。</div>
        <section className="budget-settings-style-panel">
          <div className="budget-settings-heading">
            <div><span>STYLE / AI / BUDGET</span><h2>风格配置</h2></div>
            <div className="budget-settings-heading-actions"><small>{mergedStylePrices.length} 项</small><button type="button" onClick={() => { setError(''); setShowCreateStyle(true); }}>新增风格</button></div>
          </div>
          <p className="budget-settings-price-note">每种风格的预算区间、材料系数和效果图提示词统一维护。价格用于硬装全包落地估算，不含软装、家具家电、封窗、灯具和装饰配饰。</p>
          <div className="budget-settings-style-grid">{mergedStylePrices.map((item) => {
            const promptKey = stylePromptKeyByBudgetCode[item.styleKey] ?? item.styleKey;
            const prompt = stylePrompts.find((entry) => entry.styleKey === promptKey);
            return <article className="budget-settings-style-card" key={item.styleKey}>
              <div className="budget-settings-style-card-top"><div><span className="budget-settings-style-card-label">风格模板</span><h3>{item.styleName}</h3></div><code>{item.styleKey}</code></div>
              <div className="budget-settings-style-card-price"><span>硬装全包参考价</span><strong>{item.priceLowPerSqm ?? '—'}<i> 至 </i>{item.priceHighPerSqm ?? '—'}<small> 元/㎡</small></strong></div>
              <div className="budget-settings-style-card-meta"><span>材料系数 <strong>{Number(item.materialFactor ?? 1).toFixed(2)} 倍</strong></span><span>生图提示词 <strong>{prompt ? `${prompt.prompt.length.toLocaleString()} 字` : '未配置'}</strong></span></div>
              <div className="budget-settings-style-card-actions"><button className="budget-settings-card-edit" type="button" onClick={() => { setError(''); openStyleEditor(item); }}>编辑配置</button><button className="budget-settings-delete-style" type="button" onClick={() => setDeletingStyle(item)} disabled={saving !== ''}>删除</button></div>
            </article>;
          })}</div>
        </section>
        <div className="budget-settings-groups">{groups.filter(({ group }) => group !== 'STYLE').map(({ group, items: groupItems }) => <section key={group}><div className="budget-settings-heading"><div><span>{groupLabels[group]}</span><h2>{groupLabels[group]}</h2></div><small>{groupItems.length} 项</small></div><div className="budget-settings-table">{groupItems.map((item) => { const key = `${item.coefficientGroup}:${item.coefficientCode}`; return <div className="budget-settings-row" key={key}><div><strong>{item.label}</strong><small>{item.coefficientCode}</small></div><label><span>系数</span><input type="number" min="0.5" max="2" step="0.01" value={drafts[key] ?? item.factor} onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))} /></label><button type="button" onClick={() => void save(item)} disabled={saving === key}>{saving === key ? '保存中…' : '保存'}</button></div>; })}</div></section>)}</div>
      </main>
    </div>
    {showCreateStyle && <div className="budget-style-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && saving !== 'CREATE_STYLE') setShowCreateStyle(false); }}><section className="budget-style-modal" role="dialog" aria-modal="true" aria-labelledby="budget-style-create-title"><div className="budget-style-modal-heading"><div><span>STYLE / NEW</span><h2 id="budget-style-create-title">新增风格</h2></div><button type="button" aria-label="关闭" onClick={() => setShowCreateStyle(false)} disabled={saving === 'CREATE_STYLE'}>×</button></div><form onSubmit={(event) => void createStyle(event)}><div className="budget-style-form-grid"><label>风格代码<input required pattern="[a-z][a-z0-9-]{1,39}" value={newStyle.styleKey} onChange={(event) => setNewStyle({ ...newStyle, styleKey: event.target.value })} placeholder="例如：modern-luxury" /></label><label>风格名称<input required maxLength={80} value={newStyle.styleName} onChange={(event) => setNewStyle({ ...newStyle, styleName: event.target.value })} /></label><label>最低单价<input required type="number" min="100" max="10000" value={newStyle.priceLowPerSqm} onChange={(event) => setNewStyle({ ...newStyle, priceLowPerSqm: event.target.value })} /></label><label>最高单价<input required type="number" min="100" max="10000" value={newStyle.priceHighPerSqm} onChange={(event) => setNewStyle({ ...newStyle, priceHighPerSqm: event.target.value })} /></label><label>材料系数<input required type="number" min="0.5" max="2" step="0.01" value={newStyle.materialFactor} onChange={(event) => setNewStyle({ ...newStyle, materialFactor: event.target.value })} /></label></div><label className="budget-style-form-prompt">生图提示词<textarea required rows={8} maxLength={12000} value={newStyle.prompt} onChange={(event) => setNewStyle({ ...newStyle, prompt: event.target.value })} /><small>{newStyle.prompt.length} / 12000</small></label><div className="budget-style-modal-actions"><button type="button" className="secondary" onClick={() => setShowCreateStyle(false)} disabled={saving === 'CREATE_STYLE'}>取消</button><button type="submit" disabled={saving === 'CREATE_STYLE'}>{saving === 'CREATE_STYLE' ? '创建中…' : '创建风格'}</button></div></form></section></div>}
    {editingStyle && <div className="budget-style-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditingStyle(null); }}><section className="budget-style-modal" role="dialog" aria-modal="true" aria-labelledby="budget-style-edit-title"><div className="budget-style-modal-heading"><div><span>STYLE / CONFIGURATION</span><h2 id="budget-style-edit-title">编辑 {editingStyle.styleName}</h2></div><button type="button" aria-label="关闭" onClick={() => setEditingStyle(null)} disabled={saving !== ''}>×</button></div><div className="budget-style-form-grid"><label>最低单价<input type="number" min="100" max="10000" step="50" value={priceDrafts[editingStyle.styleKey]?.low ?? ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [editingStyle.styleKey]: { ...(current[editingStyle.styleKey] ?? { low: '', high: '' }), low: event.target.value } }))} /><small>元/㎡</small></label><label>最高单价<input type="number" min="100" max="10000" step="50" value={priceDrafts[editingStyle.styleKey]?.high ?? ''} onChange={(event) => setPriceDrafts((current) => ({ ...current, [editingStyle.styleKey]: { ...(current[editingStyle.styleKey] ?? { low: '', high: '' }), high: event.target.value } }))} /><small>元/㎡</small></label><label>材料系数<input type="number" min="0.5" max="2" step="0.01" value={styleFactorDrafts[editingStyle.styleKey] ?? editingStyle.materialFactor} onChange={(event) => setStyleFactorDrafts((current) => ({ ...current, [editingStyle.styleKey]: event.target.value }))} /><small>0.5–2.0 倍</small></label></div>{(() => { const promptKey = stylePromptKeyByBudgetCode[editingStyle.styleKey] ?? editingStyle.styleKey; const prompt = stylePrompts.find((entry) => entry.styleKey === promptKey); return prompt ? <label className="budget-style-form-prompt">效果图生成提示词<textarea rows={10} maxLength={12000} value={promptDrafts[prompt.styleKey] ?? prompt.prompt} onChange={(event) => setPromptDrafts((current) => ({ ...current, [prompt.styleKey]: event.target.value }))} /><small>{(promptDrafts[prompt.styleKey] ?? prompt.prompt).length} / 12000</small></label> : <p className="budget-style-no-prompt">该风格暂未关联可编辑的生图提示词；预算和材料系数仍可单独保存。</p>; })()}<div className="budget-style-modal-actions"><button type="button" className="secondary" onClick={() => setEditingStyle(null)} disabled={saving !== ''}>取消</button><button type="button" onClick={() => void saveStyle(editingStyle)} disabled={saving === `PRICE:${editingStyle.styleKey}`}>{saving === `PRICE:${editingStyle.styleKey}` ? '保存中…' : '保存配置'}</button></div></section></div>}
    {deletingStyle && <div className="budget-style-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDeletingStyle(null); }}><section className="budget-style-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="budget-style-delete-title" aria-describedby="budget-style-delete-description"><div className="budget-style-delete-icon" aria-hidden="true">!</div><h2 id="budget-style-delete-title">确认删除“{deletingStyle.styleName}”？</h2><p id="budget-style-delete-description">删除后，该风格将从用户端预算选择、企业端风格选项和效果图生成列表中移除；对应预算区间、材料系数及材料参考也会一并删除。此操作无法撤销。</p><div className="budget-style-delete-actions"><button type="button" onClick={() => setDeletingStyle(null)} disabled={saving !== ''}>取消</button><button type="button" className="danger" onClick={() => void deleteStyle()} disabled={saving !== ''}>{saving === `DELETE:${deletingStyle.styleKey}` ? '正在删除…' : '确认删除'}</button></div></section></div>}
  </div>;
}
