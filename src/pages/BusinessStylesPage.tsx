import { useMemo, useState } from 'react';
import type { DesignStyle } from '../services/dataContracts';
import { fallbackStyleProfiles, type StyleRecommendationProfile } from '../services/styleRecommendation';
import { readLocalValue, writeLocalValue } from '../services/localDataAdapter';
import './BusinessStylesPage.css';

const storageKey = 'decoration-business-style-profiles';
const styleKeys: { key: DesignStyle; label: string }[] = [
  { key: 'modern', label: '现代简约' }, { key: 'minimal', label: '北欧原木' },
  { key: 'chinese', label: '新中式' }, { key: 'cream', label: '奶油法式' },
  { key: 'european', label: '轻奢欧式' }, { key: 'wabi', label: '自然侘寂' },
];
type StyleForm = Omit<StyleRecommendationProfile, 'style'> & { style: DesignStyle };
const emptyForm: StyleForm = { ...fallbackStyleProfiles[0], style: 'modern', minBudgetWan: 0, maxBudgetWan: 20, regions: [], priority: 1 };

function loadProfiles() { return readLocalValue<StyleRecommendationProfile[]>(storageKey, []); }

export default function BusinessStylesPage() {
  const [profiles, setProfiles] = useState<StyleRecommendationProfile[]>(loadProfiles);
  const [form, setForm] = useState<StyleForm>(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [feedback, setFeedback] = useState('');

  const saveProfiles = (next: StyleRecommendationProfile[]) => { setProfiles(next); writeLocalValue(storageKey, next); };
  const selectedLabel = useMemo(() => styleKeys.find((item) => item.key === form.style)?.label || form.name, [form.name, form.style]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const min = Number(form.minBudgetWan);
    const max = form.maxBudgetWan === undefined || form.maxBudgetWan === null || String(form.maxBudgetWan).trim() === '' ? undefined : Number(form.maxBudgetWan);
    if (!form.name.trim() || !Number.isFinite(min) || min < 0 || (max !== undefined && (!Number.isFinite(max) || max < min))) { setFeedback('请检查风格名称和预算区间。'); return; }
    const saved: StyleRecommendationProfile = { ...form, name: form.name.trim(), minBudgetWan: min, maxBudgetWan: max, regions: form.regions?.filter(Boolean) || [], priority: Number(form.priority) || 0 };
    const next = editingId ? profiles.map((item) => item.style === editingId ? saved : item) : [saved, ...profiles.filter((item) => item.style !== saved.style)];
    saveProfiles(next); setForm(emptyForm); setEditingId(''); setFeedback('风格资料已保存为本机草稿，接口接入后可同步到平台。');
  };
  const edit = (profile: StyleRecommendationProfile) => { setForm(profile); setEditingId(profile.style); setFeedback(''); };
  const remove = (style: DesignStyle) => { saveProfiles(profiles.filter((item) => item.style !== style)); setFeedback('风格资料已从本机草稿移除。'); };

  return <main className="business-styles-page">
    <header className="business-styles-header"><div><span className="business-styles-eyebrow">STYLE KNOWLEDGE</span><h1>风格资料</h1><p>维护企业擅长的风格和预算适配范围，后续用于消费者端推荐。</p></div><span className="styles-local-badge">本机草稿 · 待接口同步</span></header>
    <div className="business-styles-layout">
      <form className="styles-form" onSubmit={submit}>
        <div className="styles-form-heading"><div><span>STYLE PROFILE</span><h2>{editingId ? '编辑风格资料' : '新增风格资料'}</h2></div></div>
        <label>风格<select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value as DesignStyle, name: styleKeys.find((item) => item.key === event.target.value)?.label || form.name })}>{styleKeys.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <label>展示名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={selectedLabel} /></label>
        <div className="styles-two-fields"><label>最低预算（万元）<input type="number" min="0" step="0.1" value={form.minBudgetWan} onChange={(event) => setForm({ ...form, minBudgetWan: Number(event.target.value) })} /></label><label>最高预算（万元）<input type="number" min="0" step="0.1" value={form.maxBudgetWan ?? ''} onChange={(event) => setForm({ ...form, maxBudgetWan: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="不设上限" /></label></div>
        <label>适用地区<input value={(form.regions || []).join('、')} onChange={(event) => setForm({ ...form, regions: event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) })} placeholder="例如：上海、苏州；留空表示不限" /></label>
        <label>风格说明<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="例如：留白、干净、轻盈" /></label>
        <label>推荐理由<textarea rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="说明为什么适合这类预算和客户" /></label>
        <label>推荐权重<input type="number" min="0" max="10" step="1" value={form.priority || 0} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></label>
        <div className="styles-form-actions"><button className="styles-primary" type="submit">{editingId ? '保存修改' : '保存风格资料'}</button>{editingId && <button className="styles-secondary" type="button" onClick={() => { setEditingId(''); setForm(emptyForm); }}>取消编辑</button>}</div>
        {feedback && <p className="styles-feedback" role="status">{feedback}</p>}
      </form>
      <section className="styles-list"><div className="styles-list-heading"><div><span>COMPANY PROFILES</span><h2>已录入的风格</h2></div><small>{profiles.length} 条</small></div>{profiles.length === 0 ? <div className="styles-empty"><strong>还没有企业风格资料</strong><p>先录入一条风格资料，验证预算推荐字段。</p></div> : <div className="styles-records">{profiles.map((profile) => <article className="styles-record" key={profile.style}><div><strong>{profile.name}</strong><span>{profile.note || '未填写风格说明'}</span><p>预算 {profile.minBudgetWan} 万起{profile.maxBudgetWan === undefined ? ' · 不设上限' : ` · 至 ${profile.maxBudgetWan} 万`}{profile.regions?.length ? ` · ${profile.regions.join('、')}` : ' · 不限地区'}</p></div><div className="styles-record-actions"><button type="button" onClick={() => edit(profile)}>编辑</button><button type="button" onClick={() => remove(profile.style)}>删除</button></div></article>)}</div>}</section>
    </div>
  </main>;
}
