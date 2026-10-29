import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

const styles: { key: DesignStyle; name: string; palette: string[] }[] = [
  { key: 'modern', name: '现代简约', palette: ['#dedbd5', '#545b64', '#a5b3b9'] },
  { key: 'minimal', name: '北欧原木', palette: ['#e8dfd1', '#bda37d', '#78846a'] },
  { key: 'chinese', name: '新中式', palette: ['#ded4c1', '#785d43', '#39453c'] },
  { key: 'cream', name: '奶油法式', palette: ['#eee5d9', '#d8bca4', '#f4f0e9'] },
  { key: 'european', name: '轻奢欧式', palette: ['#d4d7d8', '#b9a68a', '#323840'] },
  { key: 'wabi', name: '自然侘寂', palette: ['#c9bda8', '#958571', '#e3dace'] },
];

const templates = [
  { title: '让阳光成为客厅的一部分', category: '客厅', style: '现代简约', image: modernLivingImage, prompt: '改造客厅，保持明亮通透，增加收纳和舒适的会客区域', className: 'living' },
  { title: '原木与亚麻的安静卧室', category: '卧室', style: '北欧原木', image: nordicBedroomImage, prompt: '设计一间安静放松的卧室，使用原木、亚麻和柔和自然光', className: 'bedroom' },
  { title: '把生活放进开放厨房', category: '厨房', style: '现代简约', image: modernKitchenImage, prompt: '优化厨房与餐厅的连接，增加备餐台面和实用储物', className: 'kitchen' },
  { title: '小空间也能从容生活', category: '小户型', style: '奶油法式', image: creamCompactImage, prompt: '为小户型提升空间利用率，浅色基调，增加隐形收纳', className: 'compact' },
  { title: '东方留白，木的呼吸', category: '全屋', style: '新中式', image: chineseHomeImage, prompt: '以现代方式呈现东方居住气质，木质、留白和克制的中式细节', className: 'oriental' },
  { title: '在自然肌理里慢下来', category: '全屋', style: '自然侘寂', image: wabiHomeImage, prompt: '营造自然安静的侘寂空间，微水泥、原木和柔和光影', className: 'wabi' },
];

function Icon({ name }: { name: 'spark' | 'upload' | 'arrow' | 'image' | 'plus' | 'workspace' | 'layers' | 'close' }) {
  const paths = {
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    workspace: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h10M7 13h5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function HomePage() {
  const { selectedStyle, setSelectedStyle } = useAppStore();
  const location = useLocation();
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [templateFilter, setTemplateFilter] = useState('精选');
  const [ideaVisible, setIdeaVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  useEffect(() => () => files.forEach((file) => URL.revokeObjectURL(file.url)), [files]);

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
    setFiles((current) => [...current, ...selected.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }))].slice(-4));
    event.target.value = '';
  };

  const startDesign = () => {
    if (!prompt.trim() && files.length === 0) {
      setNotice('先聊聊你想要的家，或者上传一张户型图。');
      return;
    }
    setIdeaVisible(true);
    setNotice('设计需求已整理为预览，AI 生成服务接入后可生成对应效果图。');
  };

  const applyTemplate = (template: typeof templates[number]) => {
    setPrompt(template.prompt);
    const match = styles.find((style) => style.name === template.style);
    if (match) setSelectedStyle(match.key);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const activeStyle = styles.find((style) => style.key === selectedStyle)!;

  return (
    <div className="home">
      <header className="home-topbar">
        <div className="welcome"><span className="online-dot" />今天，想改造哪里？</div>
        <div className="topbar-actions">
          <Link className="business-entry" to="/business"><Icon name="layers" /> 团队与材料</Link>
          <button className="help-entry" onClick={() => setNotice('这里将提供新手引导与设计帮助。')}>使用指南</button>
          <Link className="top-workspace" to="/workspace">我的方案 <Icon name="arrow" /></Link>
        </div>
      </header>

      <main className="home-content">
        <section className="creator-section" aria-labelledby="creator-title">
          <div className="creator-copy">
            <span className="eyebrow">YOUR HOME, REIMAGINED</span>
            <h1 id="creator-title">你好，<br />一起设计<span>理想的家</span>。</h1>
            <p>不需要专业术语。告诉我你的生活习惯和偏好，<br />从一句想法，看见一个家的可能。</p>
            <div className="creator-assurances"><span>六种风格</span><i /><span>支持参考图</span><i /><span>随时修改</span></div>
          </div>

          <div className="inspiration-composition" aria-label="客厅设计灵感示意">
            <div className="inspiration-orbit" />
            <div className="inspiration-photo">
              <img src={heroImage} alt="现代住宅客厅与餐厅设计灵感" />
              <span className="inspiration-tag"><Icon name="spark" /> 让灵感发生</span>
            </div>
            <div className="material-note"><span className="material-swatch" /><span><small>材质灵感</small><strong>自然 · 温润 · 松弛</strong></span></div>
            <div className="inspiration-line" aria-hidden="true"><svg viewBox="0 0 95 56"><path d="M2 54C18 7 56 2 92 13"/><path d="m83 7 9 6-7 9"/></svg></div>
          </div>
        </section>

        <section className="creation-studio" aria-label="AI 设计输入">
          <div className="studio-topline"><span><Icon name="spark" /> 和 AI 聊聊你的想法</span><span>随时换一种表达方式</span></div>
          <div className="prompt-panel">
            <textarea
              aria-label="描述你的家装需求"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="比如：我喜欢阳光、原木和一点点绿植，想把 89㎡ 的家改得明亮又松弛……"
              rows={3}
            />
            {files.length > 0 && (
              <div className="upload-previews">
                {files.map((file, index) => (
                  <div className="upload-preview" key={`${file.name}-${index}`}>
                    <img src={file.url} alt={file.name} /><span>{file.name}</span>
                    <button aria-label={`移除${file.name}`} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Icon name="close" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="prompt-footer">
              <button className="upload-button" onClick={() => inputRef.current?.click()}><Icon name="plus" /> 添加户型图或参考图</button>
              <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={addFiles} />
              <div className="selected-style-note"><span style={{ background: activeStyle.palette[1] }} />{activeStyle.name}</div>
              <button className="generate-button" onClick={startDesign}><Icon name="spark" /> 生成我的设计</button>
            </div>
          </div>
          <div className="style-picker" aria-label="选择设计风格">
            {styles.map((style) => (
              <button key={style.key} className={selectedStyle === style.key ? 'selected' : ''} onClick={() => setSelectedStyle(style.key)}>
                <span className="style-swatch">{style.palette.map((color) => <i key={color} style={{ background: color }} />)}</span>
                <span>{style.name}</span><i className="style-check">✓</i>
              </button>
            ))}
          </div>
          {notice && <div className="demo-notice"><span>i</span>{notice}<button onClick={() => setNotice('')} aria-label="关闭提示"><Icon name="close" /></button></div>}
          {ideaVisible && <div className="idea-preview"><span className="idea-icon"><Icon name="spark" /></span><div><strong>你的设计简报已准备好</strong><p>{activeStyle.name} · {files.length > 0 ? `已添加 ${files.length} 张素材` : '文字灵感'} · {prompt || '等待补充空间描述'}</p></div><Link to="/workspace">继续到工作台 <Icon name="arrow" /></Link></div>}
        </section>

        <section className="entry-links" aria-label="设计入口">
          <Link to="/workspace"><Icon name="upload" /><span><strong>有户型图？</strong><small>从真实空间开始规划</small></span><Icon name="arrow" /></Link>
          <button onClick={() => inputRef.current?.click()}><Icon name="image" /><span><strong>有喜欢的参考图？</strong><small>让 AI 读懂你的审美</small></span><Icon name="arrow" /></button>
          <button onClick={() => document.getElementById('templates')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="layers" /><span><strong>还没有具体想法？</strong><small>先去灵感画板逛逛</small></span><Icon name="arrow" /></button>
        </section>

        <section className="template-section" id="templates">
          <div className="section-heading-row">
            <div><span className="eyebrow">A LITTLE INSPIRATION</span><h2>给家的另一种可能</h2><p>选一个打动你的画面，接着讲出自己的故事。</p></div>
            <div className="template-filters" aria-label="模板分类">
              {['精选', '客厅', '卧室', '厨房', '全屋'].map((filter) => <button key={filter} className={templateFilter === filter ? 'active' : ''} onClick={() => setTemplateFilter(filter)}>{filter}</button>)}
            </div>
          </div>
          <div className="template-grid">
            {templates.filter((template) => templateFilter === '精选' || template.category === templateFilter).map((template) => (
              <button className={`template-card ${template.className}`} key={template.title} onClick={() => applyTemplate(template)}>
                <span className="template-image-wrap">
                  <img src={template.image} alt={`${template.style}${template.category}设计效果图`} loading="lazy" />
                  <span className="template-use"><Icon name="plus" /> 用它做设计</span>
                  <span className="template-category">{template.category}</span>
                </span>
                <span className="template-caption"><span><strong>{template.title}</strong><small>{template.style}</small></span><Icon name="arrow" /></span>
              </button>
            ))}
          </div>
        </section>

        <section className="workflow-strip" id="materials">
          <div className="workflow-copy"><span className="eyebrow">FROM IDEA TO HOME</span><h2>灵感不止于一张效果图</h2><p>设计、修改与方案整理，留在同一个创作空间里。</p></div>
          <div className="workflow-steps"><span><b>01</b>上传空间</span><span><b>02</b>探索风格</span><span><b>03</b>局部调整</span></div>
          <Link to="/workspace">走进设计工作台 <Icon name="arrow" /></Link>
        </section>

        <footer className="home-footer"><span>筑境 AI · 让每一个家有自己的表达</span><span>AI 效果用于设计沟通，不作为施工图纸</span></footer>
      </main>
    </div>
  );
}


