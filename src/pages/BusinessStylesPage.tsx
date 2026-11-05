import { useEffect, useMemo, useState } from 'react';
import type { DesignStyle } from '../services/dataContracts';
import { fallbackStyleProfiles, type StyleRecommendationProfile } from '../services/styleRecommendation';
import { businessDataAdapter } from '../services/businessData';
import { clearPlatformStyleCache } from '../services/styleProfileSource';
import { styleCatalog } from '../services/styleCatalog';
import './BusinessStylesPage.css';

const styleKeys: { key: DesignStyle; label: string; note: string; reason: string; minBudgetWan: number; maxBudgetWan?: number }[] = styleCatalog.map((entry) => {
  // 默认文案跟着内置资料走，避免新增一条风格时把别的风格的说明一并带进来。
  const preset = fallbackStyleProfiles.find((profile) => profile.style === entry.key);
  return { key: entry.key, label: entry.name, note: preset?.note ?? '', reason: preset?.reason ?? '', minBudgetWan: preset?.minBudgetWan ?? 0, maxBudgetWan: preset?.maxBudgetWan };
});
type StyleForm = Omit<StyleRecommendationProfile, 'style'> & { style: DesignStyle };

function blankForm(style: DesignStyle = 'modern'): StyleForm {
  const preset = styleKeys.find((item) => item.key === style) ?? styleKeys[0];
  return { style: preset.key, name: preset.label, note: preset.note, reason: preset.reason, minBudgetWan: preset.minBudgetWan, maxBudgetWan: preset.maxBudgetWan, regions: [], priority: 1 };
}

export default function BusinessStylesPage() {
  const [profiles, setProfiles] = useState<StyleRecommendationProfile[]>([]);
  const [form, setForm] = useState<StyleForm>(() => blankForm());
  const [editingId, setEditingId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    businessDataAdapter.loadStyleProfiles()
      .then((record) => { if (!cancelled) { setProfiles(record.profiles); setLoaded(true); } })
      .catch((error: unknown) => { if (!cancelled) { setLoadError(error instanceof Error ? error.message : '风格资料加载失败。'); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  const persist = async (next: StyleRecommendationProfile[], success: string) => {
    setSaving(true);
    try {
      const record = await businessDataAdapter.saveStyleProfiles(next);
      setProfiles(record.profiles);
      clearPlatformStyleCache();
      setFeedback(success);
      setLoadError('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '风格资料保存失败。');
    } finally {
      setSaving(false);
    }
  };

  const syncFromPlatform = async () => {
    setSyncing(true);
    try {
      const record = await businessDataAdapter.loadStyleProfiles();
      setProfiles(record.profiles);
      setFeedback('已从平台同步最新风格资料。');
      setLoadError('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '同步失败。');
    } finally {
      setSyncing(false);
    }
  };

  const selectedLabel = useMemo(() => styleKeys.find((item) => item.key === form.style)?.label || form.name, [form.name, form.style]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const min = Number(form.minBudgetWan);
    const max = form.maxBudgetWan === undefined || form.maxBudgetWan === null || String(form.maxBudgetWan).trim() === '' ? undefined : Number(form.maxBudgetWan);
    if (!form.name.trim() || !Number.isFinite(min) || min < 0 || (max !== undefined && (!Number.isFinite(max) || max < min))) { setFeedback('请检查风格名称和预算区间。'); return; }
    const saved: StyleRecommendationProfile = { ...form, name: form.name.trim(), minBudgetWan: min, maxBudgetWan: max, regions: form.regions?.filter(Boolean) || [], priority: Number(form.priority) || 0 };
    const next = editingId ? profiles.map((item) => item.style === editingId ? saved : item) : [saved, ...profiles.filter((item) => item.style !== saved.style)];
    setForm(blankForm()); setEditingId('');
    void persist(next, '风格资料已同步到平台，消费者端预算推荐将优先采用。');
  };
  const edit = (profile: StyleRecommendationProfile) => { setForm(profile); setEditingId(profile.style); setFeedback(''); };
  const remove = (style: DesignStyle) => { void persist(profiles.filter((item) => item.style !== style), '风格资料已从平台移除。'); };

  const statusText = saving ? '同步中…' : loaded ? '已连接平台 · 实时同步' : '连接平台中…';

  return <main className="business-styles-page">
    <header className="business-styles-header"><div><span className="business-styles-eyebrow">STYLE KNOWLEDGE</span><h1>风格资料</h1><p>维护企业擅长的风格和预算适配范围，消费者端预算推荐会优先采用这里配置的资料。</p></div><div className="styles-header-side"><span className={loaded && !loadError ? 'styles-platform-badge' : 'styles-local-badge'}>{loadError ? '未连接平台' : statusText}</span><button type="button" className="styles-secondary" disabled={syncing} onClick={() => void syncFromPlatform()}>{syncing ? '同步中…' : '从平台刷新'}</button></div></header>
    {loadError && <p className="styles-feedback styles-feedback-error" role="alert">风格资料加载失败：{loadError}</p>}
    <div className="business-styles-layout">
      <form className="styles-form" onSubmit={submit}>
        <div className="styles-form-heading"><div><span>STYLE PROFILE</span><h2>{editingId ? '编辑风格资料' : '新增风格资料'}</h2></div></div>
        <label>风格<select value={form.style} onChange={(event) => setForm(blankForm(event.target.value as DesignStyle))}>{styleKeys.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label>展示名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={selectedLabel} /></label>
        <div className="styles-two-fields"><label>最低预算（万元）<input type="number" min="0" step="0.1" value={form.minBudgetWan} onChange={(event) => setForm({ ...form, minBudgetWan: Number(event.target.value) })} /></label><label>最高预算（万元）<input type="number" min="0" step="0.1" value={form.maxBudgetWan ?? ''} onChange={(event) => setForm({ ...form, maxBudgetWan: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="不设上限" /></label></div>
        <label>适用地区<input value={(form.regions || []).join('、')} onChange={(event) => setForm({ ...form, regions: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} placeholder="例如：上海、苏州；留空表示不限" /></label>
        <label>风格说明<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="例如：留白、干净、轻盈" /></label>
        <label>推荐理由<textarea rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="说明为什么适合这类预算和客户" /></label>
        <label>推荐权重<input type="number" min="0" max="10" step="1" value={form.priority || 0} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></label>
        <div className="styles-form-actions"><button className="styles-primary" type="submit" disabled={saving || !loaded}>{editingId ? '保存修改' : '保存风格资料'}</button>{editingId && <button className="styles-secondary" type="button" onClick={() => { setEditingId(''); setForm(blankForm()); }}>取消编辑</button>}</div>
        {feedback && <p className="styles-feedback" role="status">{feedback}</p>}
      </form>
      <section className="styles-list"><div className="styles-list-heading"><div><span>COMPANY PROFILES</span><h2>已录入的风格</h2></div><small>{profiles.length} 条</small></div>{profiles.length === 0 ? <div className="styles-empty"><strong>还没有企业风格资料</strong><p>录入一条风格资料后，消费者端的预算推荐会优先采用这里的配置。</p></div> : <div className="styles-records">{profiles.map((profile) => <article className="styles-record" key={profile.style}><div><strong>{profile.name}</strong><span>{profile.note || '未填写风格说明'}</span><p>预算 {profile.minBudgetWan} 万起{profile.maxBudgetWan === undefined ? ' · 不设上限' : ` · 至 ${profile.maxBudgetWan} 万`}{profile.regions?.length ? ` · ${profile.regions.join('、')}` : ' · 不限地区'}</p></div><div className="styles-record-actions"><button type="button" onClick={() => edit(profile)}>编辑</button><button type="button" onClick={() => remove(profile.style)}>删除</button></div></article>)}</div>}</section>
    </div>
  </main>;
}
