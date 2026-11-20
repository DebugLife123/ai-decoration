import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Box, ChevronLeft, ChevronRight, FolderOpen, Layers3, Sparkles } from 'lucide-react';
import { templates } from '../features/styleLibrary/inspirationTemplates';
import './LandingPage.css';

const asset = (name: string) => `/reference-design/${name}.webp`;
const fields = [
  { label: 'AI 室内设计', title: '让家的想象，清晰可见。', description: '从一张户型图开始，结合喜欢的风格、材质与光线，探索属于你的空间方案。让想法有画面，让沟通更直观。', input: '户型图、空间照片与设计想法', output: '空间效果图与风格方案', use: '新家装修、旧房焕新与方案比选', image: 'hero-interior', thumbs: ['bedroom', 'bathroom'], route: '/workspace?source=floorplan', action: '从户型图开始' },
  { label: '无限画布', title: '把灵感铺开，让方案生长。', description: '在一张自由画布里组织参考图片、空间方案与创作内容。并排查看不同方向，让每一次调整都有清晰的上下文。', input: '参考图片、设计素材与创作内容', output: '可编辑的画布与方案组织', use: '灵感整理、视觉探索与设计推敲', image: 'material-board', thumbs: ['hall', 'bedroom'], route: '/canvas', action: '进入无限画布' },
  { label: '风格灵感', title: '找到心动的生活底色。', description: '浏览风格模板，了解配色、材质与空间表达。将喜欢的设计作为参考，再回到自己的户型中继续创作。', input: '喜欢的风格与生活偏好', output: '风格参考、配色与材质灵感', use: '装修前期、风格探索与参考收集', image: 'bedroom', thumbs: ['bathroom', 'hero-interior'], route: '/inspiration', action: '探索风格灵感' },
];
const resources = [
  { type: '案例', title: '发现真实空间的设计思路', description: '浏览案例，寻找适合自己的空间表达', image: 'consultation', route: '/cases' },
  { type: '材料', title: '从一块材质，建立家的质感', description: '探索装修材料与空间搭配', image: 'material-board', route: '/materials' },
  { type: '预算', title: '让设计想法与预算一起落地', description: '按装修需求进行预算估算', image: 'hall', route: '/budget' },
];

function Comparison() {
  const [position, setPosition] = useState(10);
  const stageRef = useRef<HTMLDivElement>(null);
  const stopAutoRef = useRef<() => void>(() => {});
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const timers: number[] = [];
    let started = false;
    let disposed = false;
    const stop = () => {
      started = true;
      timers.forEach(window.clearTimeout);
      timers.length = 0;
      stage.classList.remove('ld-compare-auto');
      observer?.disconnect();
    };
    // Effect-local resources safely reset during StrictMode's setup/cleanup replay.
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (disposed || started || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.35)) return;
      started = true;
      observer?.disconnect();
      if (motion.matches) return;
      stage.classList.add('ld-compare-auto');
      stage.style.setProperty('--compare-motion-duration', '1600ms');
      void stage.offsetWidth;
      setPosition(90);
      timers.push(window.setTimeout(() => {
        stage.style.setProperty('--compare-motion-duration', '1100ms');
        setPosition(50);
        timers.push(window.setTimeout(stop, 1100));
      }, 1600 + 2500));
    }, { threshold: [0.35] });
    stopAutoRef.current = stop;
    const onMotionChange = () => { if (motion.matches) stop(); };
    motion.addEventListener('change', onMotionChange);
    observer?.observe(stage);
    return () => {
      disposed = true;
      stop();
      motion.removeEventListener('change', onMotionChange);
      stopAutoRef.current = () => {};
    };
  }, []);
  const clamp = (value: number) => setPosition(Math.max(10, Math.min(90, value)));
  const updatePointer = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (bounds?.width) clamp((event.clientX - bounds.left) / bounds.width * 100);
  };
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const stage = stageRef.current;
    const line = stage?.querySelector<HTMLElement>('.ld-compare-line');
    // Freeze the rendered position, not the transition target, when taking control.
    const visualPosition = stage?.clientWidth && line
      ? Number.parseFloat(getComputedStyle(line).left) / stage.clientWidth * 100
      : position;
    const currentPosition = Number.isFinite(visualPosition) ? visualPosition : position;
    stopAutoRef.current();
    clamp(currentPosition);
    const step = event.shiftKey ? 5 : 2;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') clamp(currentPosition - step);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') clamp(currentPosition + step);
    else if (event.key === 'Home') clamp(10);
    else if (event.key === 'End') clamp(90);
    else return;
    event.preventDefault();
  };
  return <div className="ld-compare-panel">
    <div className="ld-compare-stage" ref={stageRef} style={{ '--compare-position': `${position}%` } as CSSProperties}>
      <img src={asset('floorplan-original')} alt="原始黑白户型平面图示例" loading="lazy" decoding="async" />
      <div className="ld-compare-after"><img src={asset('floorplan-ai-render-aligned')} alt="同一户型的材质渲染示例" loading="lazy" decoding="async" /></div>
      <span className="ld-compare-tag ld-tag-before">原始户型图</span><span className="ld-compare-tag ld-tag-after">材质渲染示例</span>
      <div className="ld-compare-line"><button type="button" className="ld-compare-handle" role="slider" aria-label="拖动查看户型渲染前后对比" aria-orientation="horizontal" aria-valuemin={10} aria-valuemax={90} aria-valuenow={Math.round(position)} aria-valuetext={`材质渲染显示 ${Math.round(position)}%`} onKeyDown={handleKey} onPointerDown={(event) => { stopAutoRef.current(); event.currentTarget.setPointerCapture(event.pointerId); updatePointer(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePointer(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}><ChevronLeft size={18} /><ChevronRight size={18} /></button></div>
    </div>
    <p className="ld-compare-note">拖动滑块，查看同一户型的两种表达 <span>展示素材 · 非实时生成结果</span></p>
  </div>;
}

const modelBrands = [
  ['openai', 'GPT', 'OpenAI'], ['claude', 'Claude', 'Anthropic'],
  ['gemini', 'Gemini', 'Google'], ['deepseek', 'DeepSeek', 'DeepSeek'],
  ['grok', 'Grok', 'xAI'], ['qwen', 'Qwen', 'Alibaba'],
  ['kimi', 'Kimi', 'Moonshot AI'], ['chatglm', 'GLM', 'Zhipu AI'],
  ['minimax', 'MiniMax', 'MiniMax'], ['doubao', 'Doubao', 'ByteDance'],
  ['hunyuan', 'Hunyuan', 'Tencent'], ['mistral', 'Mistral', 'Mistral AI'],
];

function ModelEcosystem() {
  const loopRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    const loop = loopRef.current;
    const track = trackRef.current;
    const original = setRef.current;
    if (!loop || !track || !original) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let offset = 0;
    let speed = 72;
    let previous = performance.now();
    let frame = 0;
    let visible = typeof IntersectionObserver === 'undefined';
    let hovering = false;
    let focused = false;
    let disposed = false;
    const measure = () => {
      width = original.getBoundingClientRect().width;
      if (width > 0) offset %= width;
    };
    const animate = (time: number) => {
      const elapsed = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      const target = hovering || focused || pausedRef.current ? 0 : 72;
      speed += (target - speed) * (1 - Math.exp(-8 * elapsed));
      if (width > 0) {
        offset = (offset + speed * elapsed) % width;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      frame = requestAnimationFrame(animate);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      loop.dataset.reducedMotion = String(motion.matches);
      if (motion.matches) { track.style.transform = ''; return; }
      if (disposed || document.hidden || !visible) return;
      measure();
      previous = performance.now();
      frame = requestAnimationFrame(animate);
    };
    const enter = () => { hovering = true; };
    const leave = () => { hovering = false; };
    const focus = () => { focused = true; };
    const blur = (event: FocusEvent) => { if (!loop.contains(event.relatedTarget as Node | null)) focused = false; };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(loop);
    resize?.observe(original);
    loop.addEventListener('pointerenter', enter);
    loop.addEventListener('pointerleave', leave);
    loop.addEventListener('focusin', focus);
    loop.addEventListener('focusout', blur);
    window.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    sync();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      resize?.disconnect();
      loop.removeEventListener('pointerenter', enter);
      loop.removeEventListener('pointerleave', leave);
      loop.removeEventListener('focusin', focus);
      loop.removeEventListener('focusout', blur);
      window.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);
  return <section className="ld-section ld-model-ecosystem" aria-labelledby="ld-models-title">
    <div className="ld-shell">
      <div className="ld-heading"><p className="ld-eyebrow">MODEL ECOSYSTEM</p><h2 id="ld-models-title">海量 AI 模型</h2><p>探索主流大语言与多模态模型生态。以下为品牌展示，实际可用模型以工作台为准。</p></div>
      <div className="ld-logo-loop" ref={loopRef} role="region" aria-label="AI 模型品牌展示" tabIndex={0}>
        <div className="ld-logo-loop-track" ref={trackRef}>
          {[false, true].map((duplicate) => <ul className="ld-logo-loop-list" key={String(duplicate)} ref={duplicate ? undefined : setRef} aria-hidden={duplicate || undefined}>
            {modelBrands.map(([logo, name, company]) => <li className="ld-model-logo" key={logo}><img src={`/reference-design/models/${logo}.svg`} alt="" width={46} height={46} loading="lazy" decoding="async" /><span><strong>{name}</strong><small>{company}</small></span></li>)}
          </ul>)}
        </div>
      </div>
      <div className="ld-model-meta"><span>模型生态展示 · 不代表全部已接入</span><button type="button" aria-pressed={paused} onClick={() => { pausedRef.current = !paused; setPaused(!paused); }}>{paused ? '继续滚动' : '暂停滚动'}</button></div>
    </div>
  </section>;
}

export default function LandingPage() {
  const [activeField, setActiveField] = useState(0);
  const [resourceFilter, setResourceFilter] = useState('全部');
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const field = fields[activeField];
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % fields.length;
    else if (event.key === 'ArrowLeft') next = (index + fields.length - 1) % fields.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = fields.length - 1;
    else return;
    event.preventDefault(); setActiveField(next); tabsRef.current[next]?.focus();
  };
  return <div className="landing-design">
    <section className="ld-hero" id="landing-top" aria-labelledby="ld-title">
      <div className="ld-hero-overlay" />
      <div className="ld-shell ld-hero-content">
        <div className="ld-hero-copy-block">
          <p className="ld-eyebrow">DESIGN INTELLIGENCE PLATFORM</p>
          <h1 id="ld-title" className="ld-title" aria-label="简易装 AI 设计">
            <svg className="ld-title-svg" viewBox="0 0 820 150" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="ld-title-white" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fff" /><stop offset="46%" stopColor="#fff" stopOpacity=".98" /><stop offset="76%" stopColor="#c9d1d8" stopOpacity=".64" /><stop offset="100%" stopColor="#6f7a83" stopOpacity=".08" /></linearGradient>
                <linearGradient id="ld-title-orange" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff9559" /><stop offset="46%" stopColor="#ff7a2f" stopOpacity=".98" /><stop offset="76%" stopColor="#d95a17" stopOpacity=".66" /><stop offset="100%" stopColor="#84320d" stopOpacity=".08" /></linearGradient>
                <clipPath id="ld-title-fill-clip"><rect className="ld-title-fill-wipe" x="0" y="0" width="820" height="150" /></clipPath>
              </defs>
              <g className="ld-title-outlines">{['简', '易', '装', 'A', 'I', '设', '计'].map((glyph, index) => <text key={index} className="ld-title-outline" style={{ '--glyph-index': index } as CSSProperties} x={[10, 128, 246, 378, 462, 521, 639][index]} y="116">{glyph}</text>)}</g>
              <g clipPath="url(#ld-title-fill-clip)">{['简', '易', '装', 'A', 'I', '设', '计'].map((glyph, index) => <text key={index} className={`ld-title-fill${index === 3 || index === 4 ? ' ld-title-fill-ai' : ''}`} x={[10, 128, 246, 378, 462, 521, 639][index]} y="116">{glyph}</text>)}</g>
            </svg>
          </h1>
          <p className="ld-hero-description">让每一个家的想象，都有答案。</p>
          <p className="ld-hero-copy">从户型图到空间方案，从风格灵感到材质预算。<br />让 AI 陪你把理想的家，一步步变成看得见的设计。</p>
          <div className="ld-hero-actions"><Link className="ld-button ld-button-primary" to="/workspace?source=floorplan">开始 AI 设计 <ArrowRight size={18} /></Link><Link className="ld-button ld-button-glass" to="/inspiration">浏览设计灵感</Link></div>
          <div className="ld-hero-links"><Link to="/canvas">无限画布 <ArrowRight size={14} /></Link><span /><Link to="/projects">我的项目 <ArrowRight size={14} /></Link></div>
        </div>
        <div className="ld-hero-demo">
          <div className="ld-demo-top"><span><i /> SPACE / DESIGN EXPLORATION</span><span>空间设计示例</span></div>
          <div className="ld-demo-media"><img src={asset('hall')} alt="温暖自然光下的现代室内空间设计示例" fetchPriority="high" /><div className="ld-demo-caption"><span>从灵感，到理想生活</span><strong>让空间，回应你的想象。</strong></div></div>
          <div className="ld-demo-bottom"><span><Sparkles size={14} /> 材质 · 光影 · 空间</span><Link to="/inspiration">探索更多灵感 <ArrowRight size={15} /></Link></div>
        </div>
      </div>
      <a className="ld-scroll-cue" href="#landing-workflow">探索设计的更多可能 <ArrowDown size={15} /></a>
    </section>

    <nav className="ld-launchpad ld-shell" aria-label="设计快捷入口">
      {[{ icon: Sparkles, title: '户型图设计', detail: '从你的户型开始', route: '/workspace?source=floorplan' }, { icon: Box, title: '材料库', detail: '探索空间材质', route: '/materials' }, { icon: Layers3, title: '无限画布', detail: '自由组织设计灵感', route: '/canvas' }, { icon: FolderOpen, title: '我的项目', detail: '继续上次的设计', route: '/projects' }].map(({ icon: Icon, title, detail, route }) => <Link key={route} to={route}><Icon size={24} strokeWidth={1.5} /><div><strong>{title}</strong><span>{detail}</span></div><ArrowRight className="ld-launch-arrow" size={18} /></Link>)}
    </nav>

    <ModelEcosystem />

    <section className="ld-section ld-muted" id="landing-workflow" aria-labelledby="ld-fields-title">
      <div className="ld-shell"><div className="ld-heading"><p className="ld-eyebrow">YOUR DESIGN WORKFLOW</p><h2 id="ld-fields-title">好设计，从一个想法开始</h2><p>把灵感、图纸与创作连接起来，找到适合你的设计起点。</p></div>
        <div className="ld-tabs" role="tablist" aria-label="设计工作流">{fields.map((item, index) => <button key={item.label} id={`ld-field-tab-${index}`} ref={(node) => { tabsRef.current[index] = node; }} type="button" role="tab" aria-selected={activeField === index} aria-controls="ld-field-panel" tabIndex={activeField === index ? 0 : -1} onClick={() => setActiveField(index)} onKeyDown={(event) => onTabKey(event, index)}>{item.label}</button>)}</div>
        <div className="ld-field-layout" id="ld-field-panel" role="tabpanel" aria-labelledby={`ld-field-tab-${activeField}`} tabIndex={0}>
          <div className="ld-field-gallery" key={field.image}><img src={asset(field.image)} alt={`${field.label}展示参考`} loading="lazy" decoding="async" /><div className="ld-field-thumbs" aria-hidden="true">{field.thumbs.map((image) => <img key={image} src={asset(image)} alt="" loading="lazy" decoding="async" />)}</div><span className="ld-image-credit">设计表达示例</span></div>
          <div className="ld-field-copy"><span className="ld-index">0{activeField + 1} / DESIGN POSSIBILITIES</span><h3>{field.title}</h3><p>{field.description}</p><dl className="ld-feature-list"><div><dt>输入</dt><dd>{field.input}</dd></div><div><dt>输出</dt><dd>{field.output}</dd></div><div><dt>适用</dt><dd>{field.use}</dd></div></dl><Link className="ld-button ld-button-primary" to={field.route}>{field.action}<ArrowRight size={17} /></Link></div>
        </div>
      </div>
    </section>

    <section className="ld-section" aria-labelledby="ld-inspiration-title"><div className="ld-shell"><div className="ld-heading ld-heading-row"><div><p className="ld-eyebrow">FIND YOUR OWN STYLE</p><h2 id="ld-inspiration-title">不同风格，同样热爱生活</h2></div><Link className="ld-text-link" to="/inspiration">探索 {templates.length} 套风格模板 <ArrowRight size={17} /></Link></div><div className="ld-scene-grid">{templates.slice(0, 3).map((template, index) => <Link className="ld-scene-card" to="/inspiration" key={template.id}><img src={template.thumbnail || template.image} alt={template.title} loading="lazy" decoding="async" /><div className="ld-scene-copy"><span>0{index + 1} / STYLE INSPIRATION</span><h3>{template.style}</h3><p>{template.title}</p></div><span className="ld-scene-arrow"><ArrowRight size={20} /></span></Link>)}</div></div></section>

    <section className="ld-section ld-dark" aria-labelledby="ld-compare-title"><div className="ld-shell"><div className="ld-heading ld-heading-row"><div><p className="ld-eyebrow">FROM PLAN TO POSSIBILITY</p><h2 id="ld-compare-title">让平面空间，拥有生活的质感</h2></div><p>从黑白户型到材质表达，<br />左右拖动，发现设计带来的变化。</p></div><Comparison /><div className="ld-compare-action"><Link className="ld-button ld-button-primary" to="/workspace?source=floorplan">试试我的户型图 <ArrowRight size={17} /></Link></div></div></section>

    <section className="ld-section" aria-labelledby="ld-resources-title"><div className="ld-shell"><div className="ld-heading ld-heading-row"><div><p className="ld-eyebrow">DESIGN RESOURCES</p><h2 id="ld-resources-title">让好想法，更进一步</h2></div><div className="ld-resource-filters" role="group" aria-label="资源分类">{['全部', '案例', '材料', '预算'].map((filter) => <button type="button" aria-pressed={resourceFilter === filter} onClick={() => setResourceFilter(filter)} key={filter}>{filter}</button>)}</div></div><div className="ld-resource-grid">{resources.filter((item) => resourceFilter === '全部' || item.type === resourceFilter).map((item) => <Link className="ld-resource-card" to={item.route} key={item.type}><div className="ld-resource-image"><img src={asset(item.image)} alt={`${item.type}资源展示图`} loading="lazy" decoding="async" /></div><div className="ld-resource-copy"><span>{item.type} / EXPLORE</span><h3>{item.title}</h3><p>{item.description}</p><ArrowRight size={19} /></div></Link>)}</div></div></section>

    <section className="ld-closing"><div className="ld-shell"><Box size={30} strokeWidth={1.2} /><div><p className="ld-eyebrow">DESIGN YOUR NEXT CHAPTER</p><h2>你的理想生活，从这里开始。</h2></div><Link className="ld-button ld-button-primary" to="/workspace?source=floorplan">开启我的设计 <ArrowRight size={18} /></Link></div></section>
    <footer className="ld-footer ld-shell"><div><strong>简易装 <span>AI 设计</span></strong><p>让 AI 成为更顺手的空间创作工具。</p></div><nav aria-label="页脚导航"><Link to="/projects">我的项目</Link><Link to="/inspiration">风格灵感</Link><Link to="/materials">材料库</Link><Link to="/budget">装修预算</Link></nav><a href="#landing-top" className="ld-back-top">返回顶部 ↑</a></footer>
  </div>;
}
