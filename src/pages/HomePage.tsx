import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DesignStyle } from '../stores/appStore';
import BrandLoading from '../components/BrandLoading';
import heroImage from '../assets/generated/hero-home.png';
import modernLivingImage from '../assets/generated/template-modern-living.png';
import nordicBedroomImage from '../assets/generated/template-nordic-bedroom.png';
import modernKitchenImage from '../assets/generated/template-modern-kitchen.png';
import creamCompactImage from '../assets/generated/template-cream-compact.png';
import chineseHomeImage from '../assets/generated/template-chinese-home.png';
import wabiHomeImage from '../assets/generated/template-wabi-home.png';
import lightLuxuryLivingImage from '../assets/generated/template-light-luxury-living.png';
import nordicSmallHomeImage from '../assets/generated/template-nordic-small-home.png';
import frenchKitchenImage from '../assets/generated/template-french-kitchen.png';
import wabiBedroomImage from '../assets/generated/template-wabi-bedroom.png';
import './HomePage.css';

type InspirationTemplate = {
  id: string;
  title: string;
  category: string;
  style: string;
  styleKey: DesignStyle;
  tags: string[];
  image: string;
  analysis: string;
  ruleItems: { label: string; value: string }[];
  palette: string[];
  materials: string[];
  likes: number;
};

const templates: InspirationTemplate[] = [
  { id: 'sunlit-living', title: '让阳光成为客厅的一部分', category: '客厅', style: '现代简约', styleKey: 'modern', tags: ['现代'], image: modernLivingImage, analysis: '以通透动线和低矮家具释放客餐厅的横向尺度，使用一组暖灰与木色把自然光留在空间里。', ruleItems: [{ label: '空间策略', value: '保持客餐厅连贯动线，家具不遮挡采光面' }, { label: '灯光规范', value: '主光源 3500K，局部加入洗墙和落地灯' }], palette: ['暖白', '浅灰', '原木'], materials: ['微水泥', '白橡木', '亚麻布艺'], likes: 286 },
  { id: 'quiet-bedroom', title: '原木与亚麻的安静卧室', category: '卧室', style: '北欧原木', styleKey: 'minimal', tags: ['原木'], image: nordicBedroomImage, analysis: '卧室用温和的原木作为视觉锚点，以亚麻、柔光和留白降低空间噪音，适合追求松弛感的居住者。', ruleItems: [{ label: '空间策略', value: '床头作为唯一视觉中心，衣柜与墙面同色弱化体量' }, { label: '软装规范', value: '控制材质数量，保持木、麻、棉三种触感关系' }], palette: ['米白', '蜂蜜木', '鼠尾草绿'], materials: ['白橡木', '亚麻', '手工涂料'], likes: 198 },
  { id: 'open-kitchen', title: '把生活放进开放厨房', category: '厨房', style: '现代简约', styleKey: 'modern', tags: ['现代'], image: modernKitchenImage, analysis: '通过中岛连接备餐、就餐与交流场景，将厨房从独立功能间变成全屋的生活中心。', ruleItems: [{ label: '动线规范', value: '备餐、烹饪、清洁形成连续三角动线' }, { label: '收纳规范', value: '高频用品放在中岛和下柜，减少台面暴露' }], palette: ['石墨灰', '暖白', '浅木色'], materials: ['岩板', '哑光烤漆', '木饰面'], likes: 241 },
  { id: 'cream-compact', title: '小空间也能从容生活', category: '小户型', style: '奶油法式', styleKey: 'cream', tags: ['法式'], image: creamCompactImage, analysis: '用连续的奶油色墙面和圆润家具弱化边界，叠加隐形收纳，让有限面积保持完整与轻盈。', ruleItems: [{ label: '空间策略', value: '墙面、门和柜体使用同色系，减少空间切割' }, { label: '比例规范', value: '优先选择低矮、圆角家具，预留主通道宽度' }], palette: ['奶油白', '杏仁色', '浅棕'], materials: ['艺术涂料', '木地板', 'boucle 布艺'], likes: 163 },
  { id: 'eastern-breath', title: '东方留白，木的呼吸', category: '全屋', style: '新中式', styleKey: 'chinese', tags: ['新中式'], image: chineseHomeImage, analysis: '以对称秩序、深浅木色和留白关系建立东方气质，避免堆叠传统符号，让空间更适合日常居住。', ruleItems: [{ label: '构图规范', value: '用轴线和对称关系建立稳定的空间秩序' }, { label: '材质规范', value: '深木色只做重点，其余区域留给米白和自然纹理' }], palette: ['宣纸白', '胡桃木', '墨绿'], materials: ['胡桃木', '米白石材', '棉麻'], likes: 312 },
  { id: 'slow-texture', title: '在自然肌理里慢下来', category: '全屋', style: '自然侘寂', styleKey: 'wabi', tags: ['侘寂'], image: wabiHomeImage, analysis: '用粗粝墙面、自然木材和低饱和光线形成安静底色，保留材料的不完美作为空间表情。', ruleItems: [{ label: '色彩规范', value: '整体饱和度保持低位，用明暗而不是高纯度颜色分层' }, { label: '细节规范', value: '保留手工肌理和自然结疤，避免过度精修' }], palette: ['砂岩色', '烟灰', '原木棕'], materials: ['夯土涂料', '原木', '天然石材'], likes: 354 },
  { id: 'light-luxury', title: '一盏灯，定住家的秩序', category: '客厅', style: '轻奢欧式', styleKey: 'european', tags: ['现代'], image: lightLuxuryLivingImage, analysis: '用一处重点灯光和克制的金属细节组织视觉焦点，石材与布艺平衡轻奢感与居住舒适度。', ruleItems: [{ label: '灯光规范', value: '以一处重点灯具建立焦点，其他光源保持低存在感' }, { label: '金属规范', value: '金属只作为 1 至 2 处点缀，避免空间变得过度装饰' }], palette: ['雾灰', '香槟金', '深炭色'], materials: ['大板岩板', '金属', '绒面布艺'], likes: 225 },
  { id: 'wood-storage', title: '收纳藏在木色的留白里', category: '小户型', style: '北欧原木', styleKey: 'minimal', tags: ['原木'], image: nordicSmallHomeImage, analysis: '把整墙收纳和门洞统一到木色系统中，减少零碎线条，让小户型拥有稳定、清爽的视觉秩序。', ruleItems: [{ label: '收纳规范', value: '整墙柜体统一门缝和木色，开放格只保留少量展示' }, { label: '视觉规范', value: '柜体高度对齐门洞和窗台，形成连续水平线' }], palette: ['象牙白', '原木色', '灰绿'], materials: ['木皮', '玻璃', '棉麻'], likes: 177 },
  { id: 'french-kitchen', title: '一餐一景的松弛厨房', category: '厨房', style: '奶油法式', styleKey: 'cream', tags: ['法式'], image: frenchKitchenImage, analysis: '用弧形、暖光和细腻材质消解厨房的功能感，把一日三餐变成更有仪式感的生活场景。', ruleItems: [{ label: '空间策略', value: '用餐区靠近采光面，厨房操作区保持完整效率' }, { label: '细节规范', value: '弧形收口、黄铜五金与小块砖保持同一精细尺度' }], palette: ['奶油色', '陶土粉', '橡木色'], materials: ['小块砖', '木饰面', '黄铜'], likes: 209 },
  { id: 'eastern-daily', title: '低饱和的东方日常', category: '卧室', style: '自然侘寂', styleKey: 'wabi', tags: ['侘寂', '新中式'], image: wabiBedroomImage, analysis: '卧室以低饱和色调和自然纤维营造平静感，床头、灯光和软装保持克制，适合长期居住。', ruleItems: [{ label: '色彩规范', value: '墙面和床品采用灰米、茶褐等相邻色，避免强对比' }, { label: '氛围规范', value: '使用漫反射暖光，床头保留阅读和起夜两种照明' }], palette: ['灰米', '茶褐', '旧木色'], materials: ['麻布', '木饰面', '手工砖'], likes: 268 },
];

const referenceCategories = ['全部', '全屋', '客厅', '卧室', '厨房', '小户型', '现代', '原木', '新中式', '法式', '侘寂'];
const toneOptions = ['暖白', '灰米', '木色', '低饱和'];
const lightOptions = ['自然光', '暖光', '明亮通透'];
const materialOptions = ['木饰面', '石材', '艺术涂料', '亚麻布艺'];

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'grid' | 'heart' | 'close' }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    heart: <path d="M20.8 8.8c0 5.5-8.8 10.4-8.8 10.4S3.2 14.3 3.2 8.8A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8.8 2.3Z" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function HomePage({ isInspirationPage = false }: { isInspirationPage?: boolean }) {
  const navigate = useNavigate();
  const [isEntering, setIsEntering] = useState(false);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [detailTemplate, setDetailTemplate] = useState<InspirationTemplate | null>(null);
  const [configTemplate, setConfigTemplate] = useState<InspirationTemplate | null>(null);
  const [likedTemplateIds, setLikedTemplateIds] = useState<string[]>([]);
  const [sourceType, setSourceType] = useState<'cad' | 'floorplan'>('floorplan');
  const [tone, setTone] = useState('暖白');
  const [light, setLight] = useState('自然光');
  const [material, setMaterial] = useState('木饰面');
  const timerRef = useRef<number | null>(null);
  const visibleTemplates = templates.filter((template) => activeCategory === '全部' || template.category === activeCategory || template.tags.includes(activeCategory));

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!detailTemplate && !configTemplate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailTemplate(null);
        setConfigTemplate(null);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailTemplate, configTemplate]);

  const enterWorkspace = (nextSource: 'cad' | 'floorplan' = 'floorplan', preferences?: { style?: DesignStyle; template?: string; tone?: string; light?: string; material?: string }) => {
    if (isEntering) return;
    setIsEntering(true);
    const params = new URLSearchParams({ source: nextSource });
    if (preferences?.style) params.set('style', preferences.style);
    if (preferences?.template) params.set('template', preferences.template);
    if (preferences?.tone) params.set('tone', preferences.tone);
    if (preferences?.light) params.set('light', preferences.light);
    if (preferences?.material) params.set('material', preferences.material);
    timerRef.current = window.setTimeout(() => navigate(`/workspace?${params.toString()}`), 1050);
  };

  const openConfig = (template: InspirationTemplate) => {
    setConfigTemplate(template);
    setSourceType('floorplan');
    setTone(toneOptions.includes(template.palette[0]) ? template.palette[0] : '暖白');
    setLight('自然光');
    setMaterial(materialOptions.includes(template.materials[0]) ? template.materials[0] : '木饰面');
  };

  const toggleLike = (templateId: string) => setLikedTemplateIds((current) => current.includes(templateId) ? current.filter((id) => id !== templateId) : [...current, templateId]);

  return (
    <div className={`home-page ${isInspirationPage ? 'inspiration-page' : 'landing-page'}`}>
      {isEntering && <BrandLoading />}
      <header className="home-topbar"><div className="home-status"><span className="online-dot" />个人设计工作区已准备好</div><button type="button" onClick={() => enterWorkspace('floorplan')} className="topbar-workspace" disabled={isEntering}><Icon name="grid" />进入工作台</button></header>
      <main className="home-content">
        {!isInspirationPage && <section className="home-hero"><div className="hero-copy"><span className="eyebrow">JianYiZhuang / PERSONAL DESIGN TOOL</span><h1>把一张图纸，<br /><em>变成家的样子。</em></h1><p>简艺装面向个人用户，把 CAD 图纸或户型图整理成一套可沟通、可预览的全屋装修方案。</p><div className="hero-actions"><button type="button" onClick={() => enterWorkspace('floorplan')} className="primary-action" disabled={isEntering}><Icon name="upload" />上传图纸开始设计<Icon name="arrow" /></button><button type="button" className="secondary-action" onClick={() => navigate('/inspiration')}>浏览灵感广场 <Icon name="arrow" /></button></div><div className="hero-notes"><span><Icon name="check" />支持 CAD / PDF / 图片</span><span><Icon name="check" />无需输入复杂描述</span></div></div><div className="hero-visual"><div className="hero-image-wrap"><img src={heroImage} alt="简艺装全屋空间效果图" /></div><div className="hero-caption"><span className="caption-number">01</span><span><strong>从户型关系出发</strong><small>上传资料后匹配你的空间方向</small></span></div><div className="hero-float-card"><span className="float-icon"><Icon name="spark" /></span><span><small>本次设计基于</small><strong>你的真实户型</strong></span></div></div></section>}
        {!isInspirationPage && <section className="start-panel" aria-label="开始设计"><div className="panel-heading"><div><span className="eyebrow">START WITH YOUR PLAN</span><h2>选择一种资料，开始你的全屋方案</h2></div><span className="panel-step">01 / 04</span></div><div className="entry-grid"><button type="button" onClick={() => enterWorkspace('cad')} className="entry-card entry-card-main" disabled={isEntering}><span className="entry-icon"><Icon name="file" /></span><span><strong>CAD 全屋渲染</strong><small>上传 DWG / DXF / PDF 图纸，生成空间预览与全屋方案</small></span><Icon name="arrow" /></button><button type="button" onClick={() => enterWorkspace('floorplan')} className="entry-card" disabled={isEntering}><span className="entry-icon"><Icon name="upload" /></span><span><strong>户型图设计</strong><small>上传户型图片，确认识别结果后选择装修风格</small></span><Icon name="arrow" /></button></div><div className="process-line"><span><b>01</b>上传资料</span><i /><span><b>02</b>确认户型</span><i /><span><b>03</b>选择风格</span><i /><span><b>04</b>生成方案</span></div></section>}
        {isInspirationPage ? <section className="inspiration-section" id="inspiration"><div className="section-heading"><div><span className="eyebrow">INSPIRATION SQUARE</span><h2>灵感广场</h2><p>按空间和风格浏览设计模板，打开方案查看设计说明，或基于参考生成同款。</p></div><div className="inspiration-summary"><span><strong>10</strong>套风格模板</span><span><strong>4</strong>类设计规范</span></div></div><div className="reference-toolbar"><div className="reference-filters" role="tablist" aria-label="灵感广场分类">{referenceCategories.map((category) => <button type="button" role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'active' : ''} key={category} onClick={() => setActiveCategory(category)}>{category}</button>)}</div><span className="reference-mark">JYZ / INSPIRATION</span></div><div className="reference-meta"><span>共 {visibleTemplates.length} 套参考方案</span><span>打开卡片查看规范，选择“生成同款”继续上传图纸</span></div><div className="reference-grid">{visibleTemplates.map((template) => <article className="reference-card" key={template.id}><button type="button" className="reference-card-open" onClick={() => setDetailTemplate(template)}><span className="reference-image"><img src={template.image} alt={`${template.style}${template.category}参考图`} /><span className="reference-category">{template.category}</span><span className="reference-hover-copy">查看设计规范</span></span><span className="reference-copy"><strong>{template.title}</strong><small>{template.style}</small><span className="reference-like-meta"><Icon name="heart" />{template.likes + (likedTemplateIds.includes(template.id) ? 1 : 0)}</span><Icon name="arrow" /></span></button></article>)}</div>{visibleTemplates.length === 0 && <div className="reference-empty"><Icon name="spark" /><strong>还没有匹配的参考方案</strong><span>换一个分类，继续寻找适合你的空间方向。</span></div>}</section> : <section className="featured-section"><div className="section-heading"><div><span className="eyebrow">CURATED FOR YOUR HOME</span><h2>优质方案</h2><p>看看不同户型与风格的完整空间灵感，找到适合自己的设计方向。</p></div><button type="button" className="featured-more" onClick={() => navigate('/inspiration')}>进入灵感广场 <Icon name="arrow" /></button></div><div className="featured-grid">{templates.slice(0, 3).map((template, index) => <article className="featured-card" key={template.id}><div className="featured-visual"><button type="button" className="featured-card-image" onClick={() => navigate('/inspiration')} aria-label={`在灵感广场查看${template.title}`}><img src={template.image} alt={`${template.style}${template.category}优质方案`} /><span>精选方案 · 0{index + 1}</span></button><button type="button" className="featured-upload" onClick={() => openConfig(template)} aria-label={`使用${template.title}作为设计参考`}><Icon name="upload" /><span>以此为参考</span></button></div><div className="featured-card-copy"><div><small>{template.category} / {template.style}</small><h3>{template.title}</h3></div><span><Icon name="heart" />{template.likes}</span></div></article>)}</div></section>}
        <footer className="home-footer"><span>简艺装 / JianYiZhuang</span><span>AI 效果用于设计沟通，不作为施工图纸</span></footer>
      </main>
      {isInspirationPage && detailTemplate && <div className="home-modal-backdrop" role="presentation" onMouseDown={() => setDetailTemplate(null)}><section className="inspiration-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setDetailTemplate(null)} aria-label="关闭详情"><Icon name="close" /></button><div className="modal-image"><img src={detailTemplate.image} alt={`${detailTemplate.title}详情`} /><div className="modal-image-caption"><span>{detailTemplate.category}</span><strong>{detailTemplate.style}</strong></div></div><div className="modal-content"><div className="modal-kicker">DESIGN REFERENCE / {detailTemplate.category}</div><h2 id="detail-title">{detailTemplate.title}</h2><div className="modal-subline"><span>{detailTemplate.style}</span><span><Icon name="heart" />{detailTemplate.likes + (likedTemplateIds.includes(detailTemplate.id) ? 1 : 0)} 人喜欢</span></div><div className="template-source"><span className="source-mark">简</span><span><strong>简艺装灵感编辑部</strong><small>精选空间设计参考</small></span></div><div className="detail-section"><span className="detail-label">设计分析</span><p>{detailTemplate.analysis}</p></div><div className="detail-section"><span className="detail-label">设计规范</span><div className="detail-rules">{detailTemplate.ruleItems.map((item) => <div className="detail-rule" key={item.label}><strong>{item.label}</strong><span>{item.value}</span></div>)}</div></div><div className="detail-section detail-section-inline"><div><span className="detail-label">色彩建议</span><div className="detail-palette">{detailTemplate.palette.map((item, index) => <span key={item}><i className={`palette-swatch swatch-${index}`} />{item}</span>)}</div></div><div><span className="detail-label">材质建议</span><div className="detail-tags">{detailTemplate.materials.map((item) => <span key={item}>{item}</span>)}</div></div></div><div className="modal-actions"><button type="button" aria-pressed={likedTemplateIds.includes(detailTemplate.id)} className={`like-button ${likedTemplateIds.includes(detailTemplate.id) ? 'liked' : ''}`} onClick={() => toggleLike(detailTemplate.id)}><Icon name="heart" />{likedTemplateIds.includes(detailTemplate.id) ? '已喜欢' : '喜欢'} · {detailTemplate.likes + (likedTemplateIds.includes(detailTemplate.id) ? 1 : 0)}</button><button type="button" className="modal-primary-button" onClick={() => { setDetailTemplate(null); openConfig(detailTemplate); }}>生成同款 <Icon name="arrow" /></button></div></div></section></div>}
      {configTemplate && <div className="home-modal-backdrop" role="presentation" onMouseDown={() => setConfigTemplate(null)}><section className="inspiration-modal config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={() => setConfigTemplate(null)} aria-label="关闭生成设置"><Icon name="close" /></button><div className="config-heading"><span className="eyebrow">GENERATE A SIMILAR HOME</span><h2 id="config-title">{isInspirationPage ? '生成同款方案' : '使用优质方案作为参考'}</h2><p>保留 {configTemplate.style} 的设计方向，再结合你的户型生成专属方案。</p></div><div className="config-reference"><img src={configTemplate.image} alt="当前参考模板" /><span><small>当前参考</small><strong>{configTemplate.title}</strong></span></div><div className="config-options"><fieldset><legend>上传方式</legend><div className="option-grid two-columns">{[['floorplan', '户型图设计', '上传图片户型图'], ['cad', 'CAD 全屋渲染', '上传 DWG / DXF / PDF']].map(([value, label, note]) => <button type="button" key={value} className={sourceType === value ? 'selected' : ''} onClick={() => setSourceType(value as 'cad' | 'floorplan')}><strong>{label}</strong><small>{note}</small>{sourceType === value && <Icon name="check" />}</button>)}</div></fieldset><fieldset><legend>空间色调</legend><div className="option-grid">{toneOptions.map((option) => <button type="button" key={option} className={tone === option ? 'selected' : ''} onClick={() => setTone(option)}>{option}</button>)}</div></fieldset><fieldset><legend>光线氛围</legend><div className="option-grid">{lightOptions.map((option) => <button type="button" key={option} className={light === option ? 'selected' : ''} onClick={() => setLight(option)}>{option}</button>)}</div></fieldset><fieldset><legend>主要材质</legend><div className="option-grid">{materialOptions.map((option) => <button type="button" key={option} className={material === option ? 'selected' : ''} onClick={() => setMaterial(option)}>{option}</button>)}</div></fieldset></div><div className="config-actions"><button type="button" className="quiet-button" onClick={() => setConfigTemplate(null)}>取消</button><button type="button" className="modal-primary-button" onClick={() => { setConfigTemplate(null); enterWorkspace(sourceType, { template: configTemplate.id, style: configTemplate.styleKey, tone, light, material }); }}>上传图纸并开始生成 <Icon name="arrow" /></button></div></section></div>}
    </div>
  );
}
