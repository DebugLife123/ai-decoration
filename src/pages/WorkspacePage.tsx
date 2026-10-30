import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import type { DesignStyle, DesignVersion, GenerationTask, Project } from '../stores/appStore';
import { generateDesign, type DesignMode, type GenerationResult } from '../services/aiClient';
import './WorkspacePage.css';

type StyleOption = { key: DesignStyle; name: string; palette: string[]; note: string };
type WorkspaceDraftState = { prompt?: string; style?: DesignStyle };
const styleOptions: StyleOption[] = [
  { key: 'modern', name: '现代简约', palette: ['#d9d8d1', '#69727a', '#f1f0ea'], note: '留白、干净、轻盈' },
  { key: 'minimal', name: '北欧原木', palette: ['#e4d8c6', '#b79c73', '#8b9b7c'], note: '原木、亚麻、自然光' },
  { key: 'chinese', name: '新中式', palette: ['#d6c6ad', '#806347', '#3f4a41'], note: '木色、留白、东方线条' },
  { key: 'cream', name: '奶油法式', palette: ['#eee1d3', '#d4aa97', '#fff8ef'], note: '柔和、温润、松弛' },
  { key: 'european', name: '轻奢欧式', palette: ['#c9ced0', '#b29b7d', '#3b4248'], note: '石材、金属、克制质感' },
  { key: 'wabi', name: '自然侘寂', palette: ['#c2b29d', '#897661', '#e4d9cc'], note: '肌理、安静、自然' },
];

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function Icon({ name }: { name: 'upload' | 'spark' | 'arrow' | 'close' | 'home' | 'refresh' }) {
  const paths = {
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function WorkspacePage() {
  const { selectedStyle, projects, saveProject } = useAppStore();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('projectId');
  const versionId = searchParams.get('versionId');
  const existingProject = projects.find((project) => project.id === projectId);
  const draftState = (location.state || {}) as WorkspaceDraftState;
  const initialVersion = existingProject?.versions.find((item) => item.id === versionId) || existingProject?.versions.at(-1);
  const initialStyle = initialVersion?.style || existingProject?.style || draftState.style || selectedStyle;
  const initialResult: GenerationResult | null = !initialVersion ? null : initialVersion.mode === 'photo'
    ? { type: 'photo', imageUrl: initialVersion.coverImageUrl, analysis: initialVersion.analysis }
    : {
      type: 'floorplan',
      cover: initialVersion.coverImageUrl,
      analysis: initialVersion.analysis,
      rooms: initialVersion.images.filter((image) => image.title !== '方案总览').map((image) => ({ name: image.title, description: image.description || '', imageUrl: image.imageUrl })),
    };
  const [workspaceStyle, setWorkspaceStyle] = useState<DesignStyle>(initialStyle);
  const [mode, setMode] = useState<DesignMode>(initialVersion?.mode || 'photo');
  const [photo, setPhoto] = useState<string | null>(existingProject?.photoUrls[0] || null);
  const [photos, setPhotos] = useState<string[]>(existingProject?.photoUrls || []);
  const [floorPlan, setFloorPlan] = useState<string | null>(existingProject?.floorPlanUrl || null);
  const [prompt, setPrompt] = useState(initialVersion?.prompt ?? draftState.prompt ?? '');
  const [projectName, setProjectName] = useState(existingProject?.name || '我的装修方案');
  const [result, setResult] = useState<GenerationResult | null>(initialResult);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const floorPlanInputRef = useRef<HTMLInputElement>(null);
  const activeStyle = styleOptions.find((style) => style.key === workspaceStyle) || styleOptions[0];

  const addPhotoFiles = useCallback(async (files: FileList | File[]) => {
    const images = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, 4);
    if (!images.length) return;
    const urls = await Promise.all(images.map(readImage));
    setPhotos((current) => [...current, ...urls].slice(-4));
    setPhoto(urls[0]);
  }, []);

  const handlePhotoChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void addPhotoFiles(event.target.files);
    event.target.value = '';
  }, [addPhotoFiles]);

  const handleFloorPlanChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file?.type.startsWith('image/')) setFloorPlan(await readImage(file));
    event.target.value = '';
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (mode === 'photo') void addPhotoFiles(event.dataTransfer.files);
    else {
      const file = event.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) void readImage(file).then(setFloorPlan);
    }
  }, [addPhotoFiles, mode]);

  const clearInputs = () => { setPhoto(null); setPhotos([]); setFloorPlan(null); setResult(null); setError(''); };

  const handleGenerate = async () => {
    setError('');
    if (mode === 'photo' && !photo) { setError('请先上传现场毛坯照片。'); return; }
    if (mode === 'floorplan' && !floorPlan) { setError('请先上传户型图。'); return; }
    const startedAt = new Date().toISOString();
    const activeProjectId = existingProject?.id || crypto.randomUUID();
    const task: GenerationTask = {
      id: crypto.randomUUID(),
      mode,
      style: workspaceStyle,
      prompt,
      status: 'generating',
      startedAt,
    };
    const projectDraft: Project = {
      id: activeProjectId,
      name: projectName.trim() || '我的装修方案',
      spaceType: mode === 'photo' ? '现场照片' : '全屋',
      style: workspaceStyle,
      budget: existingProject?.budget,
      area: existingProject?.area,
      city: existingProject?.city,
      createdAt: existingProject?.createdAt || startedAt,
      updatedAt: startedAt,
      status: 'generating',
      thumbnail: existingProject?.thumbnail,
      floorPlanUrl: floorPlan || existingProject?.floorPlanUrl,
      photoUrls: photos.length ? photos : existingProject?.photoUrls || [],
      versions: existingProject?.versions || [],
      tasks: [...(existingProject?.tasks || []), task],
    };
    saveProject(projectDraft);
    setIsGenerating(true);
    try {
      const nextResult = await generateDesign({ mode, style: workspaceStyle, prompt, photo: photo || undefined, photos, floorPlan: floorPlan || undefined });
      setResult(nextResult);
      const versionCreatedAt = new Date().toISOString();
      const version: DesignVersion = nextResult.type === 'photo'
        ? {
          id: crypto.randomUUID(),
          mode,
          style: workspaceStyle,
          prompt,
          createdAt: versionCreatedAt,
          analysis: nextResult.analysis,
          coverImageUrl: nextResult.imageUrl,
          images: [{ id: crypto.randomUUID(), title: '现场效果图', imageUrl: nextResult.imageUrl }],
        }
        : {
          id: crypto.randomUUID(),
          mode,
          style: workspaceStyle,
          prompt,
          createdAt: versionCreatedAt,
          analysis: nextResult.analysis,
          coverImageUrl: nextResult.cover,
          images: [
            { id: crypto.randomUUID(), title: '方案总览', imageUrl: nextResult.cover },
            ...nextResult.rooms.map((room) => ({ id: crypto.randomUUID(), title: room.name, imageUrl: room.imageUrl, description: room.description })),
          ],
        };
      const completedAt = new Date().toISOString();
      saveProject({
        ...projectDraft,
        thumbnail: version.coverImageUrl,
        versions: [...projectDraft.versions, version],
        tasks: projectDraft.tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', completedAt } : item),
        status: 'completed',
        updatedAt: completedAt,
      });
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : '生成失败，请稍后再试。';
      setError(message);
      const completedAt = new Date().toISOString();
      saveProject({
        ...projectDraft,
        tasks: projectDraft.tasks.map((item) => item.id === task.id ? { ...item, status: 'failed', completedAt, error: message } : item),
        status: 'failed',
        updatedAt: completedAt,
      });
    } finally { setIsGenerating(false); }
  };

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-top"><div><span className="workspace-eyebrow">CREATE YOUR HOME</span><h1>设计工作台</h1><Link className="projects-shortcut" to="/projects">我的项目 <Icon name="arrow" /></Link></div><span className="project-count">{projects.length} 个项目</span></div>
        <div className="mode-switcher" role="tablist">
          <button className={mode === 'photo' ? 'active' : ''} onClick={() => { setMode('photo'); setResult(null); setError(''); }} role="tab">现场照片效果图</button>
          <button className={mode === 'floorplan' ? 'active' : ''} onClick={() => { setMode('floorplan'); setResult(null); setError(''); }} role="tab">户型图全屋方案</button>
        </div>
        <div className="workspace-form">
          <section className="control-section">
            <div className="section-title"><span>{mode === 'photo' ? '01 / 上传现场照片' : '01 / 上传户型图'}</span><small>{mode === 'photo' ? '建议上传采光清楚的毛坯照' : '支持 JPG、PNG，精度先以方案沟通为主'}</small></div>
            <div className={`workspace-dropzone ${mode === 'photo' ? photo ? 'has-image' : '' : floorPlan ? 'has-image' : ''}`} onClick={() => (mode === 'photo' ? photoInputRef.current?.click() : floorPlanInputRef.current?.click())} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
              {mode === 'photo' && photo ? <img src={photo} alt="现场照片预览" /> : mode === 'floorplan' && floorPlan ? <img src={floorPlan} alt="户型图预览" /> : <><Icon name="upload" /><strong>{mode === 'photo' ? '点击或拖拽上传毛坯照片' : '点击或拖拽上传户型图'}</strong><span>图片只会在当前设计会话中使用</span></>}
              {(photo || floorPlan) && <button className="image-clear" onClick={(event) => { event.stopPropagation(); if (mode === 'photo') clearInputs(); else setFloorPlan(null); }}><Icon name="close" /></button>}
            </div>
            <input ref={photoInputRef} hidden type="file" accept="image/*" multiple onChange={handlePhotoChange} />
            <input ref={floorPlanInputRef} hidden type="file" accept="image/*" onChange={handleFloorPlanChange} />
            {mode === 'photo' && photos.length > 1 && <div className="photo-count">已添加 {photos.length} 张照片，将使用第一张作为主视角</div>}
          </section>

           <section className="control-section"><div className="section-title"><span>02 / 选择空间气质</span><small>先选一种，生成后可再次尝试</small></div><div className="style-options">{styleOptions.map((style) => <button key={style.key} className={`style-option ${workspaceStyle === style.key ? 'selected' : ''}`} onClick={() => setWorkspaceStyle(style.key)}><span className="style-palette">{style.palette.map((color) => <i key={color} style={{ background: color }} />)}</span><span><strong>{style.name}</strong><small>{style.note}</small></span>{workspaceStyle === style.key && <b>✓</b>}</button>)}</div></section>

          <section className="control-section"><div className="section-title"><span>03 / 补充你的想法</span><small>可选</small></div><textarea className="workspace-textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === 'photo' ? '比如：保留原来的窗户，增加一面电视墙，整体明亮一点…' : '比如：一家三口，需要更多收纳，希望客餐厅更通透…'} rows={4} /><input className="project-name-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="给这次方案取个名字" /></section>
          {error && <div className="workspace-error">{error}</div>}
          <button className="workspace-generate" onClick={() => void handleGenerate()} disabled={isGenerating}>{isGenerating ? <><span className="spinner" />正在分析并生成…</> : <><Icon name="spark" />生成{mode === 'photo' ? '现场效果图' : '全屋汇报方案'}<Icon name="arrow" /></>}</button>
          <p className="privacy-note">图片会通过本机代理发送到已配置的 AI 服务，密钥不会暴露给浏览器。</p>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-header"><div><Link to="/" className="back-home"><Icon name="home" /> 返回灵感首页</Link><h2>{mode === 'photo' ? '把毛坯现场，变成可讨论的家' : '从一张户型图，整理出全屋方案'}</h2><p>{mode === 'photo' ? '保留真实空间关系，先快速看到风格落地后的样子。' : '模型先识别房间，再为每个空间生成一张可用于汇报的效果图。'}</p></div><button className="clear-workspace" onClick={clearInputs}>清空本次内容</button></header>
        <section className="workspace-canvas">
          {isGenerating ? <div className="generation-loading"><div className="loading-orbit"><span /><span /><span /></div><h3>{mode === 'photo' ? '正在把现场照片变成设计效果' : '正在识别户型并整理全屋方案'}</h3><p>{mode === 'floorplan' ? '先看空间关系，再逐个生成客厅、卧室等房间画面。' : '先理解照片里的墙体、采光和视角，再生成渲染结果。'}</p></div> : !result ? <div className="canvas-intro"><span className="canvas-kicker">{mode === 'photo' ? 'PHOTO TO HOME' : 'FLOOR PLAN TO STORY'}</span><h3>{mode === 'photo' ? '先上传一张真实现场照片' : '先上传户型图，开始一套家的叙事'}</h3><p>{mode === 'photo' ? '左侧选择一种风格，生成一张用于沟通的室内效果图。' : '这不是施工图，先用图像把空间的气质、动线和生活方式说清楚。'}</p><div className="canvas-steps"><span><b>01</b>上传素材</span><span><b>02</b>选择风格</span><span><b>03</b>生成方案</span></div></div> : result.type === 'photo' ? <PhotoResult result={result} styleName={activeStyle.name} onRegenerate={() => void handleGenerate()} isGenerating={isGenerating} /> : <FloorPlanResult result={result} styleName={activeStyle.name} />}
        </section>
      </main>
    </div>
  );
}

function PhotoResult({ result, styleName, onRegenerate, isGenerating }: { result: Extract<GenerationResult, { type: 'photo' }>; styleName: string; onRegenerate: () => void; isGenerating: boolean }) {
  return <div className="result-view photo-result"><div className="result-heading"><div><span className="workspace-eyebrow">GENERATED RESULT</span><h3>{styleName} · 现场效果图</h3><p>基于上传照片生成，保留原始空间关系用于前期方案沟通。</p></div><button className="regenerate-button" onClick={onRegenerate} disabled={isGenerating}><Icon name="refresh" />重新生成</button></div><div className="hero-result-image"><img src={result.imageUrl} alt={`${styleName}现场效果图`} /></div><div className="analysis-note"><strong>视觉分析摘要</strong><span>{result.analysis || '视觉模型已完成空间分析。'}</span></div></div>;
}

function FloorPlanResult({ result, styleName }: { result: Extract<GenerationResult, { type: 'floorplan' }>; styleName: string }) {
  return <div className="result-view floorplan-result"><div className="result-heading"><div><span className="workspace-eyebrow">PRESENTATION BOARD</span><h3>{styleName} · 全屋装修汇报方案</h3><p>模型根据户型图整理了 {result.rooms.length} 个空间画面，精确性后续可继续优化。</p></div><span className="result-badge">已生成 {result.rooms.length} 个空间</span></div><div className="cover-image"><img src={result.cover} alt="全屋方案总览" /><span>方案总览</span></div><div className="analysis-note"><strong>户型识别摘要</strong><span>{result.analysis || '视觉模型已完成户型结构分析。'}</span></div><div className="room-grid">{result.rooms.map((room) => <article className="room-card" key={room.name}><img src={room.imageUrl} alt={`${room.name}效果图`} /><div><strong>{room.name}</strong><p>{room.description}</p></div></article>)}</div></div>;
}
