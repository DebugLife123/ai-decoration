import { listPublicSubmissions, submissionImageUrl, uploadSubmission } from '../services/inspirationSubmissions';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLoading from '../components/BrandLoading';
import heroImage from '../assets/generated/hero-home.png';
import { existingTemplates, templates, type InspirationTemplate } from '../features/styleLibrary/inspirationTemplates';
import { compressImageFile, reviewShowcaseImage, type UserShowcase } from '../services/showcases';
import './HomePage.css';

const toneOptions = ['暖白', '灰米', '木色', '低饱和'];
const lightOptions = ['自然光', '暖光', '明亮通透'];
const materialOptions = ['木饰面', '石材', '艺术涂料', '亚麻布艺'];

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'grid' | 'close' }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>, file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>, spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />, check: <path d="m5 12 4 4L19 6" />, grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>, close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function showcaseToTemplate(showcase: UserShowcase): InspirationTemplate {
  return {
    id: `user-${showcase.id}`, title: showcase.title, category: '用户分享', style: showcase.style, styleKey: 'modern',
    tags: [showcase.style, '用户分享'], image: showcase.imageDataUrl,
    analysis: showcase.description || '来自用户的真实装修方案分享。',
    ruleItems: [], palette: [], materials: [], prompt: '', isUserShowcase: true,
  };
}

export default function HomePage({ isInspirationPage = false }: { isInspirationPage?: boolean }) {
  const navigate = useNavigate();

  const [isEntering, setIsEntering] = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [query, setQuery] = useState('');
  const [detailTemplate, setDetailTemplate] = useState<InspirationTemplate | null>(null);
  const [configTemplate, setConfigTemplate] = useState<InspirationTemplate | null>(null);
  const [sourceType, setSourceType] = useState<'cad' | 'floorplan'>('floorplan');
  const [tone, setTone] = useState('暖白');
  const [light, setLight] = useState('自然光');
  const [material, setMaterial] = useState('木饰面');
  const [userShowcases, setUserShowcases] = useState<UserShowcase[]>([]);
  useEffect(() => {
    if (!isInspirationPage) return;
    let active = true;
    listPublicSubmissions().then(items => {
      if (active) setUserShowcases(items.filter(item => item.images.length).map(item => ({ id: item.id, title: item.title, style: item.style, description: item.description || '', imageDataUrl: submissionImageUrl(item.id, item.images[0].id), authorId: '', authorName: item.companyName || '用户', createdAt: item.createdAt })));
    }).catch(() => { if (active) setPublishError('暂时无法加载审核通过的投稿'); });
    return () => { active = false; };
  }, [isInspirationPage]);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishStyle, setPublishStyle] = useState('现代简约');
  const [publishDescription, setPublishDescription] = useState('');
  const [publishImage, setPublishImage] = useState('');
  const [publishError, setPublishError] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const publishFileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const allTemplates = [...templates, ...userShowcases.map(showcaseToTemplate)];
  const publishStyleOptions = [...new Set(templates.map((template) => template.style))];
  const categories = ['全部', ...templates.map((template) => template.style)];
  const visibleTemplates = allTemplates.filter((template) => activeCategory === '全部' || template.style === activeCategory).filter((template) => `${template.style} ${template.tags.join(' ')} ${template.materials.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  useEffect(() => {
    if (!detailTemplate && !configTemplate && !publishOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDetailTemplate(null); setConfigTemplate(null); setPublishOpen(false); } };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKeyDown); };
  }, [detailTemplate, configTemplate, publishOpen]);
  const enterWorkspace = (nextSource: 'cad' | 'floorplan' = 'floorplan', template?: InspirationTemplate) => {
    if (isEntering) return;
    setIsEntering(true);
    const params = new URLSearchParams({ source: nextSource });
    if (template) { params.set('style', template.styleKey); params.set('template', template.id); if (template.referenceAssetId) params.set('reference', template.referenceAssetId); params.set('prompt', template.prompt); params.set('tone', tone); params.set('light', light); params.set('material', material); }
    timerRef.current = window.setTimeout(() => navigate(`/workspace?${params.toString()}`), 450);
  };
  const openConfig = (template: InspirationTemplate) => { setDetailTemplate(null); setConfigTemplate(template); setSourceType('floorplan'); setTone(template.palette[0]); setLight('自然光'); setMaterial(template.materials[0]); };
  const resetPublish = () => { setPublishOpen(false); setPublishTitle(''); setPublishDescription(''); setPublishImage(''); setPublishError(''); setPublishing(false); setReviewing(false); };
  const pickPublishImage = async (file?: File) => {
    if (!file) return;
    setPublishing(true); setPublishError(''); setPublishImage(''); setReviewing(false);
    let image = '';
    try { image = await compressImageFile(file); setPublishImage(image); } catch (error) { setPublishError(error instanceof Error ? error.message : '图片处理失败'); setPublishing(false); return; }
    setPublishing(false); setReviewing(true);
    try {
      const review = await reviewShowcaseImage(image);
      if (review.category === 'floorplan') setPublishError(''); // 户型图与实景图均允许
    } catch (error) {
      setPublishImage('');
      setPublishError(error instanceof Error ? error.message : '图片审查失败，请稍后重试。');
    } finally { setReviewing(false); }
  };
  const submitPublish = async () => {
    if (reviewing || publishing) { setPublishError('图片审查中，请稍候。'); return; }
    if (!publishTitle.trim()) { setPublishError('请填写方案标题。'); return; }
    if (!publishImage) { setPublishError('请上传一张方案效果图。'); return; }
    setPublishing(true);
    try {
      const blob = await (await fetch(publishImage)).blob();
      const image = new File([blob], 'design.jpg', { type: blob.type });
      await uploadSubmission({ title: publishTitle.trim(), style: publishStyle, description: publishDescription, area: '', images: [image] });
      navigate('/inspiration/submissions');
      resetPublish();
    } catch (error) {
      setPublishing(false); setPublishError(error instanceof Error ? error.message : '投稿失败，请稍后重试。');
    }
  };
  const removeShowcase = (template: InspirationTemplate) => {
    if (!template.isUserShowcase) return;
    navigate('/inspiration/submissions');
  };
  return <div className={`home-page ${isInspirationPage ? 'inspiration-page' : 'landing-page'}`}>
    {isEntering && <BrandLoading />}
    <header className="home-topbar"><div className="home-status"><span className="online-dot" />设计风格模板</div><button type="button" onClick={() => enterWorkspace()} className="topbar-workspace" disabled={isEntering}><Icon name="grid" />进入工作台</button></header>
    <main className="home-content">
      {!isInspirationPage && <><section className="home-hero"><div className="hero-copy"><span className="eyebrow">JianYiZhuang / PERSONAL DESIGN TOOL</span><h1>把一张图纸，<br /><em>变成家的样子。</em></h1><p>上传户型图片，选定设计方向，生成全屋装修效果方案。</p><div className="hero-actions"><button type="button" onClick={() => enterWorkspace()} className="primary-action" disabled={isEntering}><Icon name="upload" />开始设计<Icon name="arrow" /></button><button type="button" className="secondary-action" onClick={() => navigate('/inspiration')}>浏览全屋风格 <Icon name="arrow" /></button></div><div className="hero-notes"><span><Icon name="check" />现代简约</span><span><Icon name="check" />宋式美学</span><span><Icon name="check" />小美风格</span></div></div><div className="hero-visual"><div className="hero-image-wrap"><img src={heroImage} alt="室内设计效果参考" /></div><div className="hero-caption"><span className="caption-number">AI</span><span><strong>从真实户型出发</strong><small>风格模板可复用</small></span></div></div></section><section className="featured-section"><div className="section-heading"><div><span className="eyebrow">CURATED DESIGN STYLES</span><h2>精选风格方案</h2><p>基于资料库参考提炼，并通过生图验证。</p></div><button type="button" className="featured-more" onClick={() => navigate('/inspiration')}>进入灵感广场 <Icon name="arrow" /></button></div><div className="featured-grid">{existingTemplates.map((template, index) => <article className="featured-card" key={template.id}><div className="featured-visual"><button type="button" className="featured-card-image" onClick={() => navigate('/inspiration')}><img src={template.image} alt={`${template.style}效果图`} /><span>风格方案 · 0{index + 1}</span></button><button type="button" className="featured-upload" onClick={() => openConfig(template)}><Icon name="upload" /><span>以此为参考</span></button></div><div className="featured-card-copy"><div><small>全屋 / {template.style}</small><h3>{template.title}</h3></div></div></article>)}</div></section></>}
      {isInspirationPage && <section className="inspiration-section" id="inspiration"><div className="section-heading"><div><span className="eyebrow">INSPIRATION SQUARE</span><h2>灵感广场</h2><p>浏览风格模板与用户分享的真实方案，也可发布自己的装修成果。</p></div><div className="inspiration-summary"><span><strong>{templates.length}</strong>套风格模板</span><span><strong>{userShowcases.length}</strong>套用户方案</span><button type="button" className="publish-showcase-button" onClick={() => setPublishOpen(true)}>+ 发布我的方案</button></div></div><div className="reference-toolbar"><div className="reference-filters" role="tablist" aria-label="风格分类">{categories.map((category) => <button type="button" role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'active' : ''} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</div><label className="reference-search"><span>搜索</span><input aria-label="搜索风格或材质" placeholder="搜索风格或材质" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div><div className="reference-meta"><span>共 {visibleTemplates.length} 套风格方案</span><span>查看风格细节，或基于户型生成方案</span></div><div className="reference-grid">{visibleTemplates.map((template) => <article className="reference-card" key={template.id}><button type="button" className="reference-card-open" onClick={() => setDetailTemplate(template)}><span className="reference-image"><img src={template.thumbnail ?? template.image} alt={`${template.style}参考图`} loading="lazy" />{template.isUserShowcase && <span className="reference-user-badge">用户分享</span>}<span className="reference-category">{template.category}</span><span className="reference-hover-copy">查看方案详情</span></span><span className="reference-copy"><strong>{template.title}</strong><small>{template.style}</small><Icon name="arrow" /></span></button></article>)}</div>{visibleTemplates.length === 0 && <p className="reference-empty">没有匹配的全屋风格，请调整搜索或分类。</p>}</section>}
      <footer className="home-footer"><span>简易装 / JianYiZhuang</span><span>AI 效果用于设计沟通，不作为施工图纸</span></footer>
    </main>
    {isInspirationPage && detailTemplate && <div className="home-modal-backdrop" role="presentation" onMouseDown={() => setDetailTemplate(null)}><section className="inspiration-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setDetailTemplate(null)} aria-label="关闭详情"><Icon name="close" /></button><div className="modal-image"><img src={detailTemplate.image} alt={`${detailTemplate.style}效果图`} /><div className="modal-image-caption"><span>{detailTemplate.category}</span><strong>{detailTemplate.style}</strong></div></div><div className="modal-content"><div className="modal-kicker">DESIGN REFERENCE / {detailTemplate.category}</div><h2 id="detail-title">{detailTemplate.title}</h2><div className="modal-subline"><span>{detailTemplate.style}</span></div><div className="detail-section"><span className="detail-label">设计分析</span><p>{detailTemplate.analysis}</p></div>{!detailTemplate.isUserShowcase && <><div className="detail-section"><span className="detail-label">设计规范</span><div className="detail-rules">{detailTemplate.ruleItems.map((item) => <div className="detail-rule" key={item.label}><strong>{item.label}</strong><span>{item.value}</span></div>)}</div></div><div className="detail-section detail-section-inline"><div><span className="detail-label">色彩建议</span><div className="detail-palette">{detailTemplate.palette.map((item, index) => <span key={item}><i className={`palette-swatch swatch-${index}`} style={detailTemplate.paletteColors ? { background: detailTemplate.paletteColors[index] } : undefined} />{item}</span>)}</div></div><div><span className="detail-label">材质建议</span><div className="detail-tags">{detailTemplate.materials.map((item) => <span key={item}>{item}</span>)}</div></div></div><details className="template-prompt"><summary>查看完整风格提示词</summary><textarea aria-label="完整风格提示词" value={detailTemplate.prompt} readOnly rows={8} /></details></>}<div className="modal-actions">{detailTemplate.isUserShowcase ? <button type="button" className="modal-danger-button" onClick={() => removeShowcase(detailTemplate)}>删除这条分享</button> : <button type="button" className="modal-primary-button" onClick={() => openConfig(detailTemplate)}>生成同款 <Icon name="arrow" /></button>}</div></div></section></div>}
    {configTemplate && <div className="home-modal-backdrop" role="presentation" onMouseDown={() => setConfigTemplate(null)}><section className="inspiration-modal config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setConfigTemplate(null)} aria-label="关闭生成设置"><Icon name="close" /></button><div className="config-heading"><span className="eyebrow">GENERATE A SIMILAR HOME</span><h2 id="config-title">生成{configTemplate.style}方案</h2><p>上传户型图片后，按所选风格生成全屋效果图。</p></div><div className="config-reference"><img src={configTemplate.image} alt="当前风格参考" /><span><small>当前参考</small><strong>{configTemplate.title}</strong></span></div><div className="config-options"><fieldset><legend>上传方式</legend><div className="option-grid two-columns">{[['floorplan', '户型图设计', '上传图片户型图'], ['cad', 'CAD / PDF', '请先导出为图片']].map(([value, label, note]) => <button type="button" key={value} className={sourceType === value ? 'selected' : ''} onClick={() => setSourceType(value as 'cad' | 'floorplan')}><strong>{label}</strong><small>{note}</small></button>)}</div></fieldset><fieldset><legend>空间色调</legend><div className="option-grid">{[...new Set([...configTemplate.palette, ...toneOptions])].map((option) => <button type="button" key={option} className={tone === option ? 'selected' : ''} onClick={() => setTone(option)}>{option}</button>)}</div></fieldset><fieldset><legend>光线氛围</legend><div className="option-grid">{lightOptions.map((option) => <button type="button" key={option} className={light === option ? 'selected' : ''} onClick={() => setLight(option)}>{option}</button>)}</div></fieldset><fieldset><legend>主要材质</legend><div className="option-grid">{[...new Set([...configTemplate.materials, ...materialOptions])].map((option) => <button type="button" key={option} className={material === option ? 'selected' : ''} onClick={() => setMaterial(option)}>{option}</button>)}</div></fieldset></div><div className="config-actions"><button type="button" className="quiet-button" onClick={() => setConfigTemplate(null)}>取消</button><button type="button" className="modal-primary-button" onClick={() => { const selected = configTemplate; setConfigTemplate(null); enterWorkspace(sourceType, selected); }}>上传图纸并开始生成 <Icon name="arrow" /></button></div></section></div>}
    {publishOpen && <div className="home-modal-backdrop" role="presentation" onMouseDown={resetPublish}><section className="inspiration-modal config-modal publish-modal" role="dialog" aria-modal="true" aria-labelledby="publish-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={resetPublish} aria-label="关闭发布窗口"><Icon name="close" /></button><div className="config-heading"><span className="eyebrow">SHARE YOUR DESIGN</span><h2 id="publish-title">发布我的装修方案</h2><p>仅支持家居实景、装修效果图或户型图。上传后 AI 会自动初审，无关图片将被拒绝。</p></div>{publishError && <p className="publish-error" role="alert">{publishError}</p>}<div className="publish-form"><label className="publish-field">方案标题<input value={publishTitle} onChange={(event) => setPublishTitle(event.target.value)} maxLength={30} placeholder="例如：89㎡ 奶油风两居" /></label><label className="publish-field">风格分类<select value={publishStyle} onChange={(event) => setPublishStyle(event.target.value)}>{publishStyleOptions.map((style) => <option key={style} value={style}>{style}</option>)}</select></label><label className="publish-field">方案说明<textarea value={publishDescription} onChange={(event) => setPublishDescription(event.target.value)} rows={3} maxLength={200} placeholder="面积、户型亮点、使用材料等（选填）" /></label><div className="publish-image-area">{publishImage ? <img src={publishImage} alt="方案效果图预览" /> : <button type="button" className="publish-upload-button" disabled={publishing || reviewing} onClick={() => publishFileRef.current?.click()}>{publishing ? '图片处理中…' : reviewing ? 'AI 审查中…' : <><Icon name="upload" />上传效果图</>}</button>}{reviewing && publishImage && <span className="publish-reviewing">AI 正在识别图片内容…</span>}<input ref={publishFileRef} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void pickPublishImage(file); }} /></div><div className="modal-actions"><button type="button" className="modal-primary-button" disabled={publishing || reviewing || !publishTitle.trim() || !publishImage} onClick={submitPublish}>{reviewing ? '审查中…' : '发布到灵感广场'}</button></div></div></section></div>}
  </div>;
}
