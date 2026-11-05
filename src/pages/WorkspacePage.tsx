import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore, type DesignStyle } from '../stores/appStore';
import { analyzeFloorPlan, generateDesign, type IdentifiedRoom, type PlanSource } from '../services/aiClient';
import { deleteDesignHistory, listDesignHistory, saveDesignHistory, type DesignHistoryRecord } from '../services/designHistory';
import { templates } from './HomePage';
import './WorkspacePage.css';

type Stage = 1 | 2 | 3 | 4;
type UploadedFile = { name: string; size: string; preview: string };
type WorkKind = 'recognizing' | 'generating' | null;
type GenerationInput = { analysis: string; rooms: IdentifiedRoom[]; selectedRooms: string[] };
const styleNotes: Partial<Record<DesignStyle, string>> = {
  modern: '暖白 · 浅木 · 隐藏收纳',
  song: '深木 · 陶器 · 东方留白',
  smallAmerican: '奶油线框 · 橄榄绿 · 复古细节',
};
const reportDetails: Record<string, { subtitle: string; principles: { title: string; body: string }[]; notes: string[] }> = {
  modern: { subtitle: '明亮、克制且适合日常居住的现代空间', principles: [{ title: '统一基底', body: '以暖白墙面与浅木色建立连续、明亮的空间感。' }, { title: '收纳隐形', body: '整合柜体与简洁线条，减少视觉干扰并保持动线通畅。' }, { title: '自然采光', body: '优先保留窗边采光，让灯光作为柔和补充。' }], notes: ['效果图用于方案沟通，实际尺寸以现场测量为准。', '柜体、门窗及固定设施位置请在施工前复核。'] },
  song: { subtitle: '以木、陶与留白表达安静含蓄的东方居住气质', principles: [{ title: '疏朗留白', body: '控制装饰密度，以非对称陈设保留空间呼吸感。' }, { title: '自然材质', body: '结合深木、肌理墙面、石材与手作陶器，呈现温润层次。' }, { title: '当代宋韵', body: '提取宋式审美的克制气质，保持现代住宅的实用尺度。' }], notes: ['木作颜色与墙面肌理会受现场光线和材料批次影响。', '效果图不替代施工图，尺寸与结构需由专业人员复核。'] },
  smallAmerican: { subtitle: '温柔奶油色与复古线条结合的轻松居家方案', principles: [{ title: '经典线条', body: '以简洁线框门板和适度装饰线条建立复古基调。' }, { title: '温暖配色', body: '奶油白搭配橄榄绿、深木色与少量黄铜细节。' }, { title: '小户型友好', body: '优先考虑轻巧家具、整合收纳与清晰活动空间。' }], notes: ['复古线条与五金细节可按预算和现货情况调整。', '家具尺度、收纳容量与过道宽度请结合现场尺寸确认。'] },
};
const styleOptions = templates.map((template) => ({ ...template, key: template.styleKey, name: template.style, note: styleNotes[template.styleKey] ?? template.style, details: reportDetails[template.styleKey] ?? reportDetails.modern }));
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function readImage(file: File) { return new Promise<string>((resolve, reject) => {
  if (!file.type.startsWith('image/')) return reject(new Error('请上传 PNG、JPG 或 WEBP 户型图片；CAD/PDF 需先导出为图片。'));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error('图片无法解码，请另存为 PNG 或 JPG 后重试。'));
    image.onload = () => {
      const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('图片处理失败，请重新选择户型图。'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}); }

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'refresh' | 'close' }) {
  const paths = { arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>, file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>, spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />, check: <path d="m5 12 4 4L19 6" />, refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>, close: <path d="m6 6 12 12M18 6 6 18" /> };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function PlanComparison({ original, render, title }: { original: string; render: string; title: string }) {
  const [position, setPosition] = useState(50);
  const updatePosition = (clientX: number, element: Element) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0) return;
    setPosition(Math.max(0, Math.min(100, ((clientX - bounds.left) / bounds.width) * 100)));
  };
  return <div className="plan-comparison">
    <img className="plan-comparison-render" src={render} alt={`${title}渲染效果`} />
    <div className="plan-comparison-original" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
      <img src={original} alt="上传的原始户型图或 CAD 图" />
    </div>
    <span className="comparison-label comparison-label-original">原始图纸</span>
    <span className="comparison-label comparison-label-render">渲染效果</span>
    <span className="comparison-divider" style={{ left: `${position}%` }}>
      <span
        className="comparison-handle"
        role="slider"
        tabIndex={0}
        aria-label={`拖动比较原始户型图与${title}渲染效果`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`原始图纸显示 ${Math.round(position)}%`}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const board = event.currentTarget.closest('.plan-comparison');
          if (board) updatePosition(event.clientX, board);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const board = event.currentTarget.closest('.plan-comparison');
          if (board) updatePosition(event.clientX, board);
        }}
        onKeyDown={(event) => {
      const step = event.shiftKey ? 10 : 2;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') setPosition((current) => Math.max(0, current - step));
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') setPosition((current) => Math.min(100, current + step));
      else if (event.key === 'Home') setPosition(0);
      else if (event.key === 'End') setPosition(100);
      else return;
      event.preventDefault();
        }}
      />
    </span>
  </div>;
}

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const { selectedStyle, setSelectedStyle } = useAppStore();
  const routeSourceType: PlanSource = searchParams.get('source') === 'floorplan' ? 'floorplan' : 'cad';
  const [sourceOverride, setSourceOverride] = useState<{ route: PlanSource; value: PlanSource } | null>(null);
  const sourceType = sourceOverride?.route === routeSourceType ? sourceOverride.value : routeSourceType;
  const [stage, setStage] = useState<Stage>(1);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [imageData, setImageData] = useState('');
  const [rooms, setRooms] = useState<IdentifiedRoom[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [results, setResults] = useState<{ name: string; imageUrl: string }[]>([]);
  const [history, setHistory] = useState<DesignHistoryRecord[]>([]);
  const [historyMessage, setHistoryMessage] = useState('');
  const [workKind, setWorkKind] = useState<WorkKind>(null);
  const [workElapsed, setWorkElapsed] = useState(0);
  const isWorking = workKind !== null;
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const requestedStyle = searchParams.get('style');
  const routeStyle = styleOptions.some((style) => style.key === requestedStyle) ? requestedStyle as DesignStyle : null;
  const [styleOverride, setStyleOverride] = useState<{ route: string | null; value: DesignStyle } | null>(null);
  const workflowStyle = styleOverride?.route === requestedStyle ? styleOverride.value : routeStyle ?? selectedStyle;
  const activeStyle = useMemo(() => styleOptions.find((style) => style.key === workflowStyle) ?? styleOptions[0], [workflowStyle]);
  const preferences = [['色调', searchParams.get('tone')], ['光线', searchParams.get('light')], ['材质', searchParams.get('material')]].filter((entry): entry is [string, string] => Boolean(entry[1]));

  useEffect(() => {
    void listDesignHistory().then(setHistory).catch((error: unknown) => {
      setHistoryMessage(error instanceof Error ? error.message : '读取本地方案记录失败。');
    });
  }, []);

  useEffect(() => {
    if (!workKind) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setWorkElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [workKind]);

  const selectFile = async (nextFile?: File) => {
    if (!nextFile) return;
    try { const preview = await readImage(nextFile); setFile({ name: nextFile.name, size: formatSize(nextFile.size), preview }); setImageData(preview); setRooms([]); setSelectedRooms([]); setResults([]); setStage(1); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : '图片读取失败。'); }
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { void selectFile(event.target.files?.[0]); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); };
  const runRecognition = async () => {
    if (!imageData) { setMessage('请先上传户型图片。'); return; }
    setWorkElapsed(0); setWorkKind('recognizing'); setMessage('');
    try {
      const result = await analyzeFloorPlan(imageData, sourceType);
      const selected = result.rooms.map((room) => room.name);
      setRooms(result.rooms);
      setSelectedRooms(selected);
      setStage(2);
      await generatePlan({ analysis: result.analysis, rooms: result.rooms, selectedRooms: selected });
    }
    catch (error) {
      console.error('Floor-plan recognition failed:', error);
      setStage(1);
      setMessage(error instanceof Error ? `户型识别失败：${error.message}` : '户型识别失败，请检查图片后重试。');
    }
    finally { setWorkKind(null); }
  };
  const generatePlan = async (input: GenerationInput) => {
    if (!imageData) { setMessage('请先上传户型图片。'); setStage(1); return; }
    setWorkElapsed(0); setWorkKind('generating'); setMessage(''); setResults([]); setStage(2);
    const sourcePrompt = sourceType === 'cad' ? '输入来源为 CAD 导出的住宅平面图，严格参考图中墙体、门窗和尺寸标注。' : '输入来源为住宅户型图，严格参考图中可见的房间边界与空间连接。';
    const prompt = [sourcePrompt, searchParams.get('prompt'), ...preferences.map(([label, value]) => `${label}:${value}`), `户型识别结果：${input.analysis}`, `识别空间：${input.rooms.map((room) => `${room.name}（${room.description}）`).join('；')}`].filter(Boolean).join('。');
    try {
      const result = await generateDesign({ mode: 'floorplan', style: workflowStyle, prompt, floorPlan: imageData, source: sourceType, analysis: input.analysis, rooms: input.rooms, selectedRooms: input.selectedRooms });
      if (result.type !== 'floorplan') throw new Error('返回结果类型不正确。');
      const generatedResults = [{ name: '全屋总览', imageUrl: result.cover }, ...result.rooms.map((room) => ({ name: room.name, imageUrl: room.imageUrl }))];
      setResults(generatedResults);
       setStage(3);
      const record: DesignHistoryRecord = {
        id: crypto.randomUUID(), name: `${activeStyle.name} · ${new Date().toLocaleDateString('zh-CN')}`, createdAt: new Date().toISOString(),
        style: workflowStyle, source: sourceType, floorPlan: imageData, analysis: result.analysis, rooms: input.rooms, selectedRooms: input.selectedRooms, results: generatedResults,
      };
      try {
        await saveDesignHistory(record);
        setHistory((current) => [record, ...current]);
        setHistoryMessage('');
      } catch (error) {
        setHistoryMessage(error instanceof Error ? `本次方案已生成，但本地记录保存失败：${error.message}` : '本次方案已生成，但本地记录保存失败。');
      }
    } catch (error) { console.error('Whole-home generation failed:', error); setStage(1); setMessage(error instanceof Error ? '方案生成失败：' + error.message : '方案生成失败，请稍后重试。'); }
    finally { setWorkKind(null); }
  };
  const openHistoryRecord = (record: DesignHistoryRecord) => {
    setStyleOverride({ route: requestedStyle, value: record.style });
    setSelectedStyle(record.style);
    setSourceOverride({ route: routeSourceType, value: record.source });
    setImageData(record.floorPlan);
    setRooms(record.rooms);
    setSelectedRooms(record.selectedRooms);
    setResults(record.results);
    setStage(4);
    setMessage('');
  };
  const removeHistoryRecord = async (id: string) => {
    try {
      await deleteDesignHistory(id);
      setHistory((current) => current.filter((record) => record.id !== id));
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : '删除方案记录失败。');
    }
  };
  const reset = () => { setFile(null); setImageData(''); setRooms([]); setSelectedRooms([]); setResults([]); setStage(1); setMessage(''); };

  return <div className="workspace-page"><main className="workspace-main">
    <header className={`workspace-header ${stage === 4 ? 'report-workspace-header' : ''}`}><div><span className="workspace-eyebrow">{stage === 4 ? 'JIAN YI ZHUANG / WHOLE-HOME STUDY' : 'JIAN YI ZHUANG / DESIGN FLOW'}</span><h2>{stage === 1 ? sourceType === 'cad' ? 'CAD 图纸全屋渲染' : '户型图全屋设计' : stage === 2 ? '正在识别并生成方案' : stage === 3 ? '方案已生成，等待查看' : `${activeStyle.name} · 整屋设计方案`}</h2>{stage < 4 && <p>{stage === 3 ? '方案已经生成并保存到当前浏览器，点击下方按钮进入完整汇报。' : sourceType === 'cad' ? '上传图纸、选择风格后，系统会自动识别空间并生成方案。' : '上传户型图、选择风格后，系统会自动识别空间并生成方案。'}</p>}</div><button className="reset-button" onClick={stage === 4 ? () => setStage(3) : reset}><Icon name="refresh" />{stage === 4 ? '返回预览' : '重新开始'}</button></header>
    {stage < 4 && searchParams.has('template') && <aside className="design-preferences"><span><strong>灵感参考已带入</strong><small>{styleOptions.find((style) => style.key === searchParams.get('style'))?.name}</small></span></aside>}
    {stage < 4 && <div className="workspace-stepper"><span className="workspace-stepper-label">全屋方案流程</span>{[['上传资料与风格', '图片 · 风格'], ['识别空间并生成', '户型 · 效果图'], ['查看生成结果', '预览 · 汇报']].map(([label, note], index) => <div className={`workspace-step ${stage === index + 1 ? 'active' : ''} ${stage > index + 1 ? 'done' : ''}`} key={label}><span className="step-index">{stage > index + 1 ? <Icon name="check" /> : `0${index + 1}`}</span><span><strong>{label}</strong><small>{note}</small></span></div>)}</div>}
    {stage < 4 && !isWorking && <div className="flow-content">
      {stage === 1 && <section className="flow-panel"><div className="panel-title"><span><b>01</b>上传资料并选择风格</span><small>{sourceType === 'cad' ? 'CAD 图纸导出图片' : '户型平面图图片'}</small></div><div className="source-tabs" role="tablist" aria-label="识别方案"><button type="button" role="tab" aria-selected={sourceType === 'cad'} className={sourceType === 'cad' ? 'active' : ''} onClick={() => { setSourceOverride({ route: routeSourceType, value: 'cad' }); setFile(null); setImageData(''); setMessage(''); }}><Icon name="file" /><span><strong>CAD 图纸全屋渲染</strong><small>DWG / DXF 导出为图片后上传</small></span></button><button type="button" role="tab" aria-selected={sourceType === 'floorplan'} className={sourceType === 'floorplan' ? 'active' : ''} onClick={() => { setSourceOverride({ route: routeSourceType, value: 'floorplan' }); setFile(null); setImageData(''); setMessage(''); }}><Icon name="upload" /><span><strong>户型图设计</strong><small>上传户型平面图图片</small></span></button></div><div className={`upload-zone ${file ? 'has-file' : ''}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter') inputRef.current?.click(); }} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>{file ? <><span className="file-preview"><img src={file.preview} alt={sourceType === 'cad' ? 'CAD 平面图预览' : '户型图预览'} /></span><span className="file-info"><strong>{file.name}</strong><small>{file.size} · {sourceType === 'cad' ? 'CAD 平面图' : '户型图'}</small></span><button className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); setImageData(''); }} aria-label="移除文件"><Icon name="close" /></button></> : <><span className="upload-zone-icon"><Icon name="upload" /></span><strong>{sourceType === 'cad' ? '拖入 CAD 导出图，或点击选择图片' : '拖入户型图，或点击选择图片'}</strong><small>{sourceType === 'cad' ? 'DWG / DXF / PDF 请先导出为 PNG、JPG 或 WEBP' : '支持 PNG、JPG、WEBP 格式的户型平面图'}</small></>}<input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleChange} /></div><div className="panel-tip"><span>i</span>{sourceType === 'cad' ? '按 CAD 图纸的墙体、门窗和尺寸标注识别；目前请先导出为图片，暂不直接读取 DWG / DXF / PDF 文件。' : '识别户型图中的房间、门窗和空间动线；请上传清晰、完整的平面图。'}</div><div className="style-picker-heading"><div><strong>选择空间风格</strong><small>先定下全屋的色彩与材质方向，识别后可直接生成</small></div></div><div className="workspace-style-grid">{styleOptions.map((style) => <button type="button" key={style.key} aria-pressed={workflowStyle === style.key} className={`workspace-style-card ${workflowStyle === style.key ? 'selected' : ''}`} onClick={() => { setStyleOverride({ route: requestedStyle, value: style.key }); setSelectedStyle(style.key); }}><span className="workspace-style-image"><img src={style.image} alt={`${style.name}风格参考`} /></span><span className="workspace-style-meta"><strong>{style.name}</strong><small>{style.note}</small></span>{workflowStyle === style.key && <span className="style-check"><Icon name="check" /></span>}</button>)}</div><div className="upload-actions"><span className="style-current">当前风格：<strong>{activeStyle.name}</strong></span><button className="continue-button" onClick={() => void runRecognition()} disabled={isWorking || !imageData}>{isWorking ? <><span className="spinner" />正在识别…</> : <>识别户型空间 <Icon name="arrow" /></>}</button></div>{message && <p className="flow-message">{message}</p>}</section>}
      {stage === 3 && results.length > 0 && <section className="result-board generation-preview"><div className="result-board-head"><div><span className="panel-kicker">生成完成</span><h3>方案已经准备好</h3><p>结果已保存到当前浏览器，查看汇报前仍可回到工作区调整资料。</p></div><button className="continue-button" onClick={() => setStage(4)}>查看汇报方案 <Icon name="arrow" /></button></div><div className="result-cover"><img src={results[0].imageUrl} alt="全屋方案总览预览" /><div><span>全屋效果总览</span><strong>{activeStyle.name} · {selectedRooms.length} 个空间</strong></div></div><div className="result-room-grid">{results.slice(1).map((result) => <article key={result.name}><img src={result.imageUrl} alt={`${result.name}效果图预览`} /><div><strong>{result.name}</strong><small>空间效果已生成</small></div></article>)}</div><div className="flow-actions"><button className="quiet-button" onClick={() => setStage(1)}>重新上传资料</button><button className="continue-button" onClick={() => setStage(4)}>进入完整汇报 <Icon name="arrow" /></button></div>{message && <p className="flow-message">{message}</p>}</section>}
    </div>}
    {stage === 1 && <section className="design-history" aria-label="历史生成方案"><div className="design-history-heading"><div><span>方案记录</span><h3>最近生成</h3></div><small>仅保存在当前浏览器</small></div>{historyMessage && <p className="history-message">{historyMessage}</p>}{history.length > 0 ? <div className="design-history-list">{history.map((record) => <article className="design-history-item" key={record.id}><button className="history-open" onClick={() => openHistoryRecord(record)}><img src={record.results[0]?.imageUrl} alt="" /><span><strong>{record.name}</strong><small>{new Date(record.createdAt).toLocaleString('zh-CN')} · {record.rooms.length} 个空间</small></span></button><button className="history-delete" aria-label={`删除${record.name}`} title="删除记录" onClick={() => void removeHistoryRecord(record.id)}>×</button></article>)}</div> : !historyMessage && <p className="history-empty">完成一份全屋方案后，会保存在这里，之后可继续查看。</p>}</section>}
    {isWorking && <section className={`working-state ${workKind === 'generating' ? 'generation-state' : ''}`} aria-live="polite"><div className="working-state-topline"><span className="live-indicator" />{workKind === 'recognizing' ? '户型识别' : '全屋方案生成'}<span className="working-elapsed">已等待 {workElapsed} 秒</span></div><div className="loading-orbit"><span /><span /><span /></div><h3>{workKind === 'recognizing' ? '正在读取户型空间' : '正在创作你的全屋方案'}</h3><p>{workKind === 'recognizing' ? '正在分析图面中的空间、墙体与开口信息。' : `已提交 ${activeStyle.name} 风格与 ${selectedRooms.length} 个空间，正在等待效果图返回。`}</p><div className="working-timeline"><div className="working-timeline-item done"><span><Icon name="check" /></span><div><strong>{workKind === 'recognizing' ? '图片已接收' : '风格与空间要求已提交'}</strong><small>{workKind === 'recognizing' ? '已开始分析你上传的图纸' : `已选择 ${activeStyle.name} · ${selectedRooms.length} 个空间`}</small></div></div><div className="working-timeline-item active"><span className="timeline-pulse" /><div><strong>{workKind === 'recognizing' ? '识别空间结构' : '生成总览与空间效果图'}</strong><small>{workKind === 'recognizing' ? '整理可辨认房间与空间关系' : '图片模型正在处理，耗时会随空间数量和上游响应变化'}</small></div></div><div className="working-timeline-item"><span /><div><strong>{workKind === 'recognizing' ? '整理识别结果' : '保存生成结果'}</strong><small>{workKind === 'recognizing' ? '完成后会展示空间识别状态' : '图片返回后会先停留在工作区，点击后再进入设计汇报'}</small></div></div></div>{workKind === 'generating' && workElapsed >= 45 && <p className="working-long-wait">生成仍在进行中。请保持页面打开；如果上游服务超时，页面会显示具体错误，已完成的方案不会被误报为成功。</p>}<span className="working-disclaimer">当前显示的是工作流状态，不代表模型的精确百分比。</span></section>}
    {stage === 4 && results.length > 0 && <div className="whole-home-report">
      <nav className="report-nav" aria-label="汇报目录"><a href="#report-overview">方案概览</a><a href="#report-style">风格说明</a><a href="#report-board">全屋设计</a><a href="#report-rooms">空间方案</a><a href="#report-notes">设计考量</a><button className="report-history-return" onClick={() => setStage(1)}>返回方案记录</button><span><i />已生成方案</span></nav>
      <section className="report-hero" id="report-overview"><div className="report-hero-copy"><span className="report-kicker">全屋设计 · 方案概览</span><p className="report-title-style">{activeStyle.name}</p><h1>整屋设计方案</h1><p className="report-hero-summary">{activeStyle.details.subtitle}</p><div className="report-tags">{activeStyle.note.split(' · ').map((tag) => <span key={tag}>{tag}</span>)}</div><a className="report-primary-link" href="#report-rooms">浏览空间方案 <Icon name="arrow" /></a></div><figure className="report-plan-figure"><img src={imageData} alt="本方案对应的原始户型图" /><figcaption><span>原始户型依据</span><strong>{rooms.length} 个识别空间</strong></figcaption></figure></section>
      <div className="report-metrics"><span><strong>{selectedRooms.length}</strong><small>进入设计的空间</small></span><span><strong>{rooms.length - selectedRooms.length}</strong><small>保留识别空间</small></span><span><strong>{activeStyle.palette.length}</strong><small>全屋主色</small></span><span><strong>{activeStyle.materials.length}</strong><small>建议材质</small></span></div>
      <section className="report-section report-style-section" id="report-style"><div className="report-section-heading"><span>02</span><div><h4>全屋设计风格说明</h4><p>先建立统一的材质与色彩秩序，再让每个房间保留自己的功能性格。</p></div></div><div className="report-principles">{activeStyle.details.principles.map((item, index) => <article key={item.title}><small>0{index + 1}</small><strong>{item.title}</strong><p>{item.body}</p></article>)}</div><div className="report-materials"><div><strong>色彩关系</strong><div className="report-swatches">{activeStyle.palette.map((color) => <span key={color}><i style={{ background: color }} />{color}</span>)}</div></div><div><strong>材质方向</strong><p>{activeStyle.materials.join(' · ')}</p></div></div></section>
      <section className="report-section report-board-section" id="report-board"><div className="report-section-heading"><span>03</span><div><h4>整屋设计</h4><p>拖动分隔线，对照原始户型图与全屋渲染结果。</p></div></div><div className="design-board-grid"><article className="design-board-cover"><PlanComparison original={imageData} render={results[0].imageUrl} title="全屋" /><div><span>全屋效果总览</span><strong>{activeStyle.name} · 全屋方案</strong></div></article><article className="design-board-brief"><span>设计构想</span><h5>设计概念</h5><p>{activeStyle.analysis}</p><dl><div><dt>设计风格</dt><dd>{activeStyle.name}</dd></div><div><dt>空间范围</dt><dd>{selectedRooms.map((name) => name).join('、')}</dd></div><div><dt>户型依据</dt><dd>基于上传户型图及识别出的空间信息</dd></div></dl></article><article className="design-board-plan"><img src={imageData} alt="原始户型平面图" /><span>原始户型依据</span></article><article className="design-board-colors"><span>材质与色彩</span><h5>材质与色彩</h5><div className="report-swatches">{activeStyle.palette.map((color) => <span key={color}><i style={{ background: color }} />{color}</span>)}</div><p>{activeStyle.materials.join('、')}</p></article></div></section>
      <section className="report-section report-rooms-section" id="report-rooms"><div className="report-section-heading"><span>04</span><div><h4>沿着生活动线，逐间看方案</h4><p>每张效果图对应一个明确识别的房间，不使用模糊空间编号。</p></div></div><div className="report-room-list">{results.slice(1).map((item, index) => { const room = rooms.find((entry) => entry.name === item.name); return <article className="report-room" key={`${item.name}-${index}`}><div className="report-room-image"><img src={item.imageUrl} alt={`${item.name}室内视角效果图`} /><span>{item.name} · 室内视角</span></div><div className="report-room-copy"><span className="report-kicker">{activeStyle.name} · 空间设计</span><h5>{item.name}</h5><p>{room?.description || `按户型中${item.name}所在位置与相邻空间关系设计。`}</p><small>概念示意，非施工依据</small></div></article>; })}</div></section>
      <section className="report-section report-notes-section" id="report-notes"><div className="report-section-heading"><span>05</span><div><h4>落地前，需要确认的判断</h4><p>把识别与效果表达的边界说明清楚，便于继续深化。</p></div></div><div className="report-checks"><article><strong>01 / 图面核对</strong><p>房间边界、门窗及固定设施以原始户型图为依据；模糊信息需现场复核。</p></article><article><strong>02 / 尺寸复核</strong><p>效果图不代表精确尺寸，施工前需完成现场测量并核验通行与家具尺度。</p></article><article><strong>03 / 实施边界</strong><p>当前方案用于设计沟通，不替代施工图、材料封样、报价与工艺确认。</p></article></div><div className="report-room-register"><strong>本次户型识别</strong>{rooms.map((room) => <span key={room.name}>{room.name}</span>)}</div></section>
    </div>}
  </main></div>;
}
