import { Link } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import type { DesignStyle } from '../stores/appStore';
import heroImage from '../assets/generated/hero-home.png';
import modernLivingImage from '../assets/generated/template-modern-living.png';
import nordicBedroomImage from '../assets/generated/template-nordic-bedroom.png';
import modernKitchenImage from '../assets/generated/template-modern-kitchen.png';
import creamCompactImage from '../assets/generated/template-cream-compact.png';
import chineseHomeImage from '../assets/generated/template-chinese-home.png';
import wabiHomeImage from '../assets/generated/template-wabi-home.png';
import './HomePage.css';

const styles: { key: DesignStyle; name: string; description: string; palette: string[] }[] = [
  { key: 'modern', name: '现代简约', description: '干净线条与通透留白', palette: ['#d9d8d1', '#69727a', '#f1f0ea'] },
  { key: 'minimal', name: '北欧原木', description: '原木、亚麻与自然光', palette: ['#e4d8c6', '#b79c73', '#8b9b7c'] },
  { key: 'chinese', name: '新中式', description: '东方比例与木质层次', palette: ['#d6c6ad', '#806347', '#3f4a41'] },
  { key: 'cream', name: '奶油法式', description: '柔和温润的生活氛围', palette: ['#eee1d3', '#d4aa97', '#fff8ef'] },
  { key: 'european', name: '轻奢欧式', description: '石材、金属与克制质感', palette: ['#c9ced0', '#b29b7d', '#3b4248'] },
  { key: 'wabi', name: '自然侘寂', description: '肌理、安静与自然呼吸', palette: ['#c2b29d', '#897661', '#e3dace'] },
];

const templates = [
  { title: '让阳光成为客厅的一部分', category: '客厅', style: '现代简约', image: modernLivingImage },
  { title: '原木与亚麻的安静卧室', category: '卧室', style: '北欧原木', image: nordicBedroomImage },
  { title: '把生活放进开放厨房', category: '厨房', style: '现代简约', image: modernKitchenImage },
  { title: '小空间也能从容生活', category: '小户型', style: '奶油法式', image: creamCompactImage },
  { title: '东方留白，木的呼吸', category: '全屋', style: '新中式', image: chineseHomeImage },
  { title: '在自然肌理里慢下来', category: '全屋', style: '自然侘寂', image: wabiHomeImage },
];

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'grid' }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function HomePage() {
  const { selectedStyle, setSelectedStyle } = useAppStore();
  const activeStyle = styles.find((style) => style.key === selectedStyle) ?? styles[0];

  return (
    <div className="home-page">
      <header className="home-topbar"><div className="home-status"><span className="online-dot" />个人设计工作区已准备好</div><Link to="/workspace" className="topbar-workspace"><Icon name="grid" />进入工作台</Link></header>
      <main className="home-content">
        <section className="home-hero"><div className="hero-copy"><span className="eyebrow">JianYiZhuang / PERSONAL DESIGN TOOL</span><h1>把一张图纸，<br /><em>变成家的样子。</em></h1><p>简艺装面向个人用户，把 CAD 图纸或户型图整理成一套可沟通、可预览的全屋装修方案。</p><div className="hero-actions"><Link to="/workspace" className="primary-action"><Icon name="upload" />上传图纸开始设计<Icon name="arrow" /></Link><a href="#styles" className="secondary-action">先看看风格 <Icon name="arrow" /></a></div><div className="hero-notes"><span><Icon name="check" />支持 CAD / PDF / 图片</span><span><Icon name="check" />无需输入复杂描述</span></div></div><div className="hero-visual"><div className="hero-image-wrap"><img src={heroImage} alt="简艺装全屋空间效果图" /></div><div className="hero-caption"><span className="caption-number">01</span><span><strong>从户型关系出发</strong><small>识别空间，再选择适合你的风格</small></span></div><div className="hero-float-card"><span className="float-icon"><Icon name="spark" /></span><span><small>本次设计基于</small><strong>{activeStyle.name}</strong></span></div></div></section>
        <section className="start-panel" aria-label="开始设计"><div className="panel-heading"><div><span className="eyebrow">START WITH YOUR PLAN</span><h2>选择一种资料，开始你的全屋方案</h2></div><span className="panel-step">01 / 04</span></div><div className="entry-grid"><Link to="/workspace?source=cad" className="entry-card entry-card-main"><span className="entry-icon"><Icon name="file" /></span><span><strong>CAD 全屋渲染</strong><small>上传 DWG / DXF / PDF 图纸，生成空间预览与全屋方案</small></span><Icon name="arrow" /></Link><Link to="/workspace?source=floorplan" className="entry-card"><span className="entry-icon"><Icon name="upload" /></span><span><strong>户型图设计</strong><small>上传户型图片，确认识别结果后选择装修风格</small></span><Icon name="arrow" /></Link></div><div className="process-line"><span><b>01</b>上传资料</span><i /><span><b>02</b>确认户型</span><i /><span><b>03</b>选择风格</span><i /><span><b>04</b>生成方案</span></div></section>
        <section className="style-section" id="styles"><div className="section-heading"><div><span className="eyebrow">PRESET STYLES</span><h2>先选一个你喜欢的基调</h2><p>不需要写提示词，选择预设风格即可开始。</p></div><Link to="/workspace">进入设计工作台 <Icon name="arrow" /></Link></div><div className="style-grid">{styles.map((style) => <button key={style.key} className={`style-card ${selectedStyle === style.key ? 'selected' : ''}`} onClick={() => setSelectedStyle(style.key)}><span className="style-palette">{style.palette.map((color) => <i key={color} style={{ background: color }} />)}</span><span className="style-card-copy"><strong>{style.name}</strong><small>{style.description}</small></span>{selectedStyle === style.key && <span className="style-selected"><Icon name="check" /></span>}</button>)}</div></section>
        <section className="inspiration-section" id="templates"><div className="section-heading"><div><span className="eyebrow">SPACE REFERENCES</span><h2>看看不同空间如何落地</h2><p>这些效果图只用于寻找方向，最终方案从你的户型开始。</p></div><span className="reference-mark">JYZ / 06</span></div><div className="reference-grid">{templates.map((template) => <Link to="/workspace" className="reference-card" key={template.title}><span className="reference-image"><img src={template.image} alt={`${template.style}${template.category}参考图`} /><span>{template.category}</span></span><span className="reference-copy"><strong>{template.title}</strong><small>{template.style}</small><Icon name="arrow" /></span></Link>)}</div></section>
        <footer className="home-footer"><span>简艺装 / JianYiZhuang</span><span>AI 效果用于设计沟通，不作为施工图纸</span></footer>
      </main>
    </div>
  );
}