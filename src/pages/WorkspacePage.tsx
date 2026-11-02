import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore, type DesignStyle } from '../stores/appStore';
import { analyzeFloorPlan, generateDesign, type IdentifiedRoom, type PlanSource } from '../services/aiClient';
import { templates } from './HomePage';
import './WorkspacePage.css';

type Stage = 1 | 2 | 3 | 4;
type UploadedFile = { name: string; size: string; preview: string };
const styleNotes: Partial<Record<DesignStyle, string>> = {
  modern: '暖白 · 浅木 · 隐藏收纳',
  song: '深木 · 陶器 · 东方留白',
  smallAmerican: '奶油线框 · 橄榄绿 · 复古细节',
};
const styleOptions = templates.map((template) => ({ key: template.styleKey, name: template.style, note: styleNotes[template.styleKey] ?? template.style, palette: template.palette, image: template.image }));
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function readImage(file: File) { return new Promise<string>((resolve, reject) => { if (!file.type.startsWith('image/')) return reject(new Error('请上传 PNG、JPG 或 WEBP 户型图片；CAD/PDF 需先导出为图片。')); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重新选择。')); reader.readAsDataURL(file); }); }

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'refresh' | 'close' }) {
  const paths = { arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>, upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>, file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>, spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />, check: <path d="m5 12 4 4L19 6" />, refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>, close: <path d="m6 6 12 12M18 6 6 18" /> };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const { selectedStyle, setSelectedStyle } = useAppStore();
  const [sourceType, setSourceType] = useState<PlanSource>(searchParams.get('source') === 'floorplan' ? 'floorplan' : 'cad');
  const [stage, setStage] = useState<Stage>(1);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [imageData, setImageData] = useState('');
  const [rooms, setRooms] = useState<IdentifiedRoom[]>([]);
  const [analysis, setAnalysis] = useState('');
  const [results, setResults] = useState<{ name: string; imageUrl: string }[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeStyle = useMemo(() => styleOptions.find((style) => style.key === selectedStyle) ?? styleOptions[0], [selectedStyle]);
  const preferences = [['色调', searchParams.get('tone')], ['光线', searchParams.get('light')], ['材质', searchParams.get('material')]].filter((entry): entry is [string, string] => Boolean(entry[1]));
  useEffect(() => { const source = searchParams.get('source'); if (source === 'cad' || source === 'floorplan') setSourceType(source); const requestedStyle = searchParams.get('style'); if (styleOptions.some((style) => style.key === requestedStyle)) setSelectedStyle(requestedStyle as DesignStyle); }, [searchParams, setSelectedStyle]);

  const selectFile = async (nextFile?: File) => {
    if (!nextFile) return;
    try { const preview = await readImage(nextFile); setFile({ name: nextFile.name, size: formatSize(nextFile.size), preview }); setImageData(preview); setRooms([]); setResults([]); setStage(1); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : '图片读取失败。'); }
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { void selectFile(event.target.files?.[0]); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); };
  const runRecognition = async () => {
    if (!imageData) { setMessage('请先上传户型图片。'); return; }
    setIsWorking(true); setMessage('');
    try { const result = await analyzeFloorPlan(imageData, sourceType); setAnalysis(result.analysis); setRooms(result.rooms); setStage(2); }
    catch (error) { setMessage(error instanceof Error ? error.message : '户型识别失败，请稍后重试。'); }
    finally { setIsWorking(false); }
  };
  const generatePlan = async () => {
    if (!imageData) { setMessage('请先上传户型图片。'); setStage(1); return; }
    setIsWorking(true); setMessage(''); setResults([]);
    const sourcePrompt = sourceType === 'cad' ? '输入来源为 CAD 导出的住宅平面图，严格参考图中墙体、门窗和尺寸标注。' : '输入来源为住宅户型图，严格参考图中可见的房间边界与空间连接。';
    const prompt = [sourcePrompt, searchParams.get('prompt'), ...preferences.map(([label, value]) => `${label}:${value}`), `户型识别结果：${analysis}`, `识别空间：${rooms.map((room) => `${room.name}（${room.description}）`).join('；')}`].filter(Boolean).join('。');
    try {
      const result = await generateDesign({ mode: 'floorplan', style: selectedStyle, prompt, floorPlan: imageData, source: sourceType });
      if (result.type !== 'floorplan') throw new Error('返回结果类型不正确。');
      setResults([{ name: '全屋总览', imageUrl: result.cover }, ...result.rooms.map((room) => ({ name: room.name, imageUrl: room.imageUrl }))]);
      setAnalysis(result.analysis); setStage(4);
    } catch (error) { setMessage(error instanceof Error ? error.message : '生成失败，请检查 AI 接口配置后重试。'); }
    finally { setIsWorking(false); }
  };
  const reset = () => { setFile(null); setImageData(''); setRooms([]); setAnalysis(''); setResults([]); setStage(1); setMessage(''); };

  return <div className="workspace-page"><main className="workspace-main">
    <header className="workspace-header"><div><span className="workspace-eyebrow">JIAN YI ZHUANG / DESIGN FLOW</span><h2>{stage === 1 ? sourceType === 'cad' ? 'CAD 图纸全屋渲染' : '户型图全屋设计' : stage === 2 ? '确认识别出的空间' : stage === 3 ? '选择设计风格' : '全屋方案已生成'}</h2><p>{sourceType === 'cad' ? '上传 CAD 图纸导出的平面图片，识别墙体与空间关系后生成全屋效果图。' : '上传户型平面图，识别房间与动线后生成全屋效果图。'}</p></div><button className="reset-button" onClick={reset}><Icon name="refresh" />重新开始</button></header>
    {searchParams.has('template') && <aside className="design-preferences"><span><strong>灵感参考已带入</strong><small>{styleOptions.find((style) => style.key === searchParams.get('style'))?.name}</small></span>{preferences.map(([label, value]) => <span className="preference-chip" key={label}>{label} · {value}</span>)}</aside>}
    <div className="workspace-stepper"><span className="workspace-stepper-label">全屋方案流程</span>{[['上传资料', '户型图片'], ['确认户型', '空间识别结果'], ['选择风格', '预设模板'], ['生成方案', '效果图']].map(([label, note], index) => <div className={`workspace-step ${stage === index + 1 ? 'active' : ''} ${stage > index + 1 ? 'done' : ''}`} key={label}><span className="step-index">{stage > index + 1 ? <Icon name="check" /> : `0${index + 1}`}</span><span><strong>{label}</strong><small>{note}</small></span></div>)}</div>
    {stage < 4 && <div className="flow-content">
      {stage === 1 && <section className="flow-panel"><div className="panel-title"><span><b>01</b>上传设计资料</span><small>{sourceType === 'cad' ? 'CAD 图纸导出图片' : '户型平面图图片'}</small></div><div className="source-tabs" role="tablist" aria-label="识别方案"><button type="button" role="tab" aria-selected={sourceType === 'cad'} className={sourceType === 'cad' ? 'active' : ''} onClick={() => { setSourceType('cad'); setFile(null); setImageData(''); setMessage(''); }}><Icon name="file" /><span><strong>CAD 图纸全屋渲染</strong><small>DWG / DXF 导出为图片后上传</small></span></button><button type="button" role="tab" aria-selected={sourceType === 'floorplan'} className={sourceType === 'floorplan' ? 'active' : ''} onClick={() => { setSourceType('floorplan'); setFile(null); setImageData(''); setMessage(''); }}><Icon name="upload" /><span><strong>户型图设计</strong><small>上传户型平面图图片</small></span></button></div><div className={`upload-zone ${file ? 'has-file' : ''}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter') inputRef.current?.click(); }} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>{file ? <><span className="file-preview"><img src={file.preview} alt={sourceType === 'cad' ? 'CAD 平面图预览' : '户型图预览'} /></span><span className="file-info"><strong>{file.name}</strong><small>{file.size} · {sourceType === 'cad' ? 'CAD 平面图' : '户型图'}</small></span><button className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); setImageData(''); }} aria-label="移除文件"><Icon name="close" /></button></> : <><span className="upload-zone-icon"><Icon name="upload" /></span><strong>{sourceType === 'cad' ? '拖入 CAD 导出图，或点击选择图片' : '拖入户型图，或点击选择图片'}</strong><small>{sourceType === 'cad' ? 'DWG / DXF / PDF 请先导出为 PNG、JPG 或 WEBP' : '支持 PNG、JPG、WEBP 格式的户型平面图'}</small></>}<input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleChange} /></div><div className="panel-tip"><span>i</span>{sourceType === 'cad' ? '按 CAD 图纸的墙体、门窗和尺寸标注识别；目前请先导出为图片，暂不直接读取 DWG / DXF / PDF 文件。' : '识别户型图中的房间、门窗和空间动线；请上传清晰、完整的平面图。'}</div><button className="continue-button" onClick={() => void runRecognition()} disabled={isWorking}>{isWorking ? <><span className="spinner" />正在识别{sourceType === 'cad' ? 'CAD 图纸' : '户型图'}…</> : <>开始识别{sourceType === 'cad' ? 'CAD 图纸' : '户型图'} <Icon name="arrow" /></>}</button>{message && <p className="flow-message">{message}</p>}</section>}
      {stage === 2 && <section className="flow-panel recognition-panel"><div className="panel-title"><span><b>02</b>确认户型识别结果</span><small>视觉模型识别</small></div><div className="recognition-layout"><div className="plan-preview"><img src={imageData} alt="已上传户型图" /><span>上传户型图</span></div><div className="recognition-copy"><div className="recognition-ok"><Icon name="check" />识别完成</div><h3>识别到 {rooms.length} 个空间</h3><p>{analysis}</p><div className="room-list">{rooms.map((room) => <div className="room-row" key={room.name}><span><strong>{room.name}</strong><small>{room.description}</small></span></div>)}</div></div></div><div className="flow-actions"><button className="quiet-button" onClick={() => setStage(1)}>返回修改</button><button className="continue-button" onClick={() => setStage(3)}>确认并选择风格 <Icon name="arrow" /></button></div></section>}
      {stage === 3 && <section className="flow-panel style-panel"><div className="panel-title"><span><b>03</b>选择预设装修风格</span><small>三套验证模板</small></div><div className="workspace-style-grid">{styleOptions.map((style) => <button key={style.key} className={`workspace-style-card ${selectedStyle === style.key ? 'selected' : ''}`} onClick={() => setSelectedStyle(style.key)}><span className="workspace-style-image"><img src={style.image} alt={`${style.name}参考`} /></span><span className="workspace-style-meta"><strong>{style.name}</strong><small>{style.note}</small></span>{selectedStyle === style.key && <span className="style-check"><Icon name="check" /></span>}</button>)}</div><div className="style-selected-summary"><span className="summary-swatch">{activeStyle.palette.map((color) => <i key={color} style={{ background: color }} />)}</span><span><small>当前选择</small><strong>{activeStyle.name}</strong></span><button className="continue-button" onClick={() => void generatePlan()} disabled={isWorking}>{isWorking ? <><span className="spinner" />正在生成方案…</> : <>生成全屋方案 <Icon name="spark" /></>}</button></div>{message && <p className="flow-message">{message}</p>}</section>}
    </div>}
    {isWorking && <section className="working-state"><div className="loading-orbit"><span /><span /><span /></div><span className="workspace-eyebrow">AI DESIGN GENERATION</span><h3>{stage === 1 ? '正在识别户型空间' : '正在生成全屋效果图'}</h3><p>请保持页面打开，生成时间取决于图像模型响应。</p></section>}
    {stage === 4 && results.length > 0 && <section className="result-board"><div className="result-board-head"><div><span className="workspace-eyebrow">AI GENERATED / DESIGN RESULT</span><h3>{activeStyle.name} · 全屋方案</h3><p>{analysis}</p></div><button className="quiet-button" onClick={() => setStage(3)}><Icon name="refresh" />调整风格</button></div><div className="result-summary"><span><b>识别空间</b>{rooms.length} 个</span><span><b>设计风格</b>{activeStyle.name}</span><span><b>输出内容</b>AI 效果图</span></div><div className="result-room-grid">{results.map((item) => <article key={item.name}><img src={item.imageUrl} alt={`${item.name}生成效果`} /><div><strong>{item.name}</strong><small>{activeStyle.name}</small></div></article>)}</div></section>}
  </main></div>;
}
