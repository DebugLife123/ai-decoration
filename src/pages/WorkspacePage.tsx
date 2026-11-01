import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import type { DesignStyle } from '../stores/appStore';
import heroImage from '../assets/generated/hero-home.png';
import modernLivingImage from '../assets/generated/template-modern-living.png';
import nordicBedroomImage from '../assets/generated/template-nordic-bedroom.png';
import modernKitchenImage from '../assets/generated/template-modern-kitchen.png';
import creamCompactImage from '../assets/generated/template-cream-compact.png';
import chineseHomeImage from '../assets/generated/template-chinese-home.png';
import wabiHomeImage from '../assets/generated/template-wabi-home.png';
import './WorkspacePage.css';

type SourceType = 'cad' | 'floorplan';
type Stage = 1 | 2 | 3 | 4;
type UploadedFile = { name: string; type: string; size: string; preview?: string };
type StyleOption = { key: DesignStyle; name: string; note: string; palette: string[]; image: string };

const styleOptions: StyleOption[] = [
  { key: 'modern', name: '现代简约', note: '留白、干净、轻盈', palette: ['#d9d8d1', '#69727a', '#f1f0ea'], image: modernLivingImage },
  { key: 'minimal', name: '北欧原木', note: '原木、亚麻、自然光', palette: ['#e4d8c6', '#b79c73', '#8b9b7c'], image: nordicBedroomImage },
  { key: 'chinese', name: '新中式', note: '木色、留白、东方线条', palette: ['#d6c6ad', '#806347', '#3f4a41'], image: chineseHomeImage },
  { key: 'cream', name: '奶油法式', note: '柔和、温润、松弛', palette: ['#eee1d3', '#d4aa97', '#fff8ef'], image: creamCompactImage },
  { key: 'european', name: '轻奢欧式', note: '石材、金属、克制质感', palette: ['#c9ced0', '#b29b7d', '#3b4248'], image: modernKitchenImage },
  { key: 'wabi', name: '自然侘寂', note: '肌理、安静、自然', palette: ['#c2b29d', '#897661', '#e4d9cc'], image: wabiHomeImage },
];

const rooms = [
  { name: '客餐厅', area: '28.6㎡', detail: '开间、采光与主要动线已识别' },
  { name: '主卧', area: '15.2㎡', detail: '床位、窗向与衣柜墙已识别' },
  { name: '次卧', area: '10.8㎡', detail: '可作为儿童房或多功能房' },
  { name: '厨房', area: '6.4㎡', detail: '操作区与生活阳台关系已识别' },
];

const workflowSteps = [
  ['上传资料', 'CAD / 户型图'],
  ['确认户型', '空间识别结果'],
  ['选择风格', '预设设计方向'],
  ['生成方案', '效果图与汇报'],
] as const;

function Icon({ name }: { name: 'arrow' | 'upload' | 'file' | 'spark' | 'check' | 'refresh' | 'close' }) {
  const paths = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>,
    file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function readPreview(file: File) { return new Promise<string | undefined>((resolve) => { if (!file.type.startsWith('image/')) { resolve(undefined); return; } const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => resolve(undefined); reader.readAsDataURL(file); }); }

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const { selectedStyle, setSelectedStyle } = useAppStore();
  const [sourceType, setSourceType] = useState<SourceType>(searchParams.get('source') === 'floorplan' ? 'floorplan' : 'cad');
  const [stage, setStage] = useState<Stage>(1);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [resultVisible, setResultVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeStyle = useMemo(() => styleOptions.find((style) => style.key === selectedStyle) ?? styleOptions[0], [selectedStyle]);
  const templateId = searchParams.get('template');
  const preferenceEntries = [
    ['色调', searchParams.get('tone')],
    ['光线', searchParams.get('light')],
    ['材质', searchParams.get('material')],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  useEffect(() => {
    const requestedStyle = searchParams.get('style');
    if (styleOptions.some((style) => style.key === requestedStyle)) setSelectedStyle(requestedStyle as DesignStyle);
  }, [searchParams, setSelectedStyle]);

  const selectFile = async (nextFile?: File) => { if (!nextFile) return; const accepted = nextFile.type.startsWith('image/') || /\.(dwg|dxf|pdf)$/i.test(nextFile.name); if (!accepted) { setMessage('请选择 CAD、PDF 或户型图片文件。'); return; } setFile({ name: nextFile.name, type: nextFile.type || 'CAD / PDF', size: formatSize(nextFile.size), preview: await readPreview(nextFile) }); setStage(1); setResultVisible(false); setMessage(''); };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { void selectFile(event.target.files?.[0]); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); };
  const runRecognition = () => { if (!file) { setMessage('请先上传一份 CAD 图纸或户型图。'); return; } setMessage(''); setIsWorking(true); window.setTimeout(() => { setIsWorking(false); setStage(2); }, 650); };
  const generatePlan = () => { setMessage(''); setIsWorking(true); window.setTimeout(() => { setIsWorking(false); setStage(4); setResultVisible(true); }, 900); };
  const reset = () => { setFile(null); setStage(1); setResultVisible(false); setMessage(''); };

  return (
    <div className="workspace-page">
      <main className="workspace-main"><header className="workspace-header"><div><span className="workspace-eyebrow">JIAN YI ZHUANG / DESIGN FLOW</span><h2>{resultVisible ? '你的全屋方案已经准备好' : stage === 1 ? '先把空间资料交给简艺装' : stage === 2 ? '确认识别出的户型信息' : stage === 3 ? '选择一套适合你的风格' : '生成一份可讨论的全屋方案'}</h2><p>{resultVisible ? '以下内容用于前期沟通，你可以重新选择风格再生成一版。' : '每一步都可以回看和调整，不需要输入复杂的设计描述。'}</p></div><button className="reset-button" onClick={reset}><Icon name="refresh" />重新开始</button></header>
        {stage === 1 && (templateId || preferenceEntries.length > 0) && <aside className="design-preferences"><span><strong>灵感参考已带入</strong>{templateId && <small>模板编号：{templateId}</small>}</span>{preferenceEntries.map(([label, value]) => <span className="preference-chip" key={label}>{label} · {value}</span>)}</aside>}
        <div className="workspace-stepper" aria-label="设计流程"><span className="workspace-stepper-label">全屋方案流程</span>{workflowSteps.map(([title, note], index) => { const step = (index + 1) as Stage; return <button key={title} className={`workspace-step ${stage === step ? 'active' : ''} ${stage > step ? 'done' : ''}`} onClick={() => stage >= step && setStage(step)} disabled={stage < step} aria-current={stage === step ? 'step' : undefined}><span className="step-index">{stage > step ? <Icon name="check" /> : `0${step}`}</span><span><strong>{title}</strong><small>{note}</small></span></button>; })}</div>
        {!resultVisible && !isWorking && <div className="flow-content">{stage === 1 && <section className="flow-panel upload-panel"><div className="panel-title"><span><b>01</b>上传设计资料</span><small>支持 CAD、PDF、PNG、JPG</small></div><div className="source-tabs"><button className={sourceType === 'cad' ? 'active' : ''} onClick={() => setSourceType('cad')}><Icon name="file" /><span><strong>CAD 全屋渲染</strong><small>DWG / DXF / PDF</small></span></button><button className={sourceType === 'floorplan' ? 'active' : ''} onClick={() => setSourceType('floorplan')}><Icon name="upload" /><span><strong>户型图设计</strong><small>图片户型图</small></span></button></div><div className={`upload-zone ${file ? 'has-file' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onClick={() => inputRef.current?.click()}>{file ? <><span className="file-preview">{file.preview ? <img src={file.preview} alt="上传的户型图预览" /> : <Icon name="file" />}</span><span className="file-info"><strong>{file.name}</strong><small>{file.size} · {sourceType === 'cad' ? 'CAD 图纸' : '户型图文件'}</small></span><button className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); }} aria-label="移除文件"><Icon name="close" /></button></> : <><span className="upload-zone-icon"><Icon name="upload" /></span><strong>{sourceType === 'cad' ? '拖入 CAD 图纸，或点击选择文件' : '拖入户型图，或点击选择图片'}</strong><small>{sourceType === 'cad' ? '推荐上传完整户型 CAD 或导出的 PDF' : '支持清晰的户型平面图，识别效果更稳定'}</small></>}<input ref={inputRef} type="file" hidden accept={sourceType === 'cad' ? '.dwg,.dxf,.pdf,image/*' : 'image/*,.pdf'} onChange={handleChange} /></div><div className="panel-tip"><span>i</span>{sourceType === 'cad' ? '真实 CAD 解析接入后，将自动识别墙体、门窗与空间关系。' : '上传后会先生成一份户型识别结果，确认无误再继续。'}</div><button className="continue-button" onClick={runRecognition} disabled={isWorking}>{isWorking ? <><span className="spinner" />正在识别户型…</> : <>开始识别户型 <Icon name="arrow" /></>}</button>{message && <p className="flow-message">{message}</p>}</section>}{stage === 2 && <section className="flow-panel recognition-panel"><div className="panel-title"><span><b>02</b>确认户型识别结果</span><small>Mock 识别结果</small></div><div className="recognition-layout"><div className="plan-preview">{file?.preview ? <img src={file.preview} alt="户型图预览" /> : <img src={heroImage} alt="户型识别示意" />}<span>识别预览</span></div><div className="recognition-copy"><div className="recognition-ok"><Icon name="check" />已完成空间识别</div><h3>这套户型包含 4 个主要空间</h3><p>简艺装已根据上传资料整理出空间名称、面积和基础关系，后续将以此生成全屋方案。</p><div className="room-list">{rooms.map((room) => <div className="room-row" key={room.name}><span><strong>{room.name}</strong><small>{room.detail}</small></span><b>{room.area}</b></div>)}</div></div></div><div className="flow-actions"><button className="quiet-button" onClick={() => setStage(1)}>返回修改</button><button className="continue-button" onClick={() => setStage(3)}>确认并选择风格 <Icon name="arrow" /></button></div></section>}{stage === 3 && <section className="flow-panel style-panel"><div className="panel-title"><span><b>03</b>选择预设装修风格</span><small>选择一个方向即可</small></div><div className="workspace-style-grid">{styleOptions.map((style) => <button key={style.key} className={`workspace-style-card ${selectedStyle === style.key ? 'selected' : ''}`} onClick={() => setSelectedStyle(style.key)}><span className="workspace-style-image"><img src={style.image} alt={`${style.name}风格参考`} /></span><span className="workspace-style-meta"><strong>{style.name}</strong><small>{style.note}</small></span>{selectedStyle === style.key && <span className="style-check"><Icon name="check" /></span>}</button>)}</div><div className="style-selected-summary"><span className="summary-swatch">{activeStyle.palette.map((color) => <i key={color} style={{ background: color }} />)}</span><span><small>当前选择</small><strong>{activeStyle.name}</strong></span><button className="continue-button" onClick={generatePlan} disabled={isWorking}>{isWorking ? <><span className="spinner" />正在生成方案…</> : <>一键生成全屋方案 <Icon name="spark" /></>}</button></div>{message && <p className="flow-message">{message}</p>}</section>}</div>}
        {isWorking && <section className="working-state"><div className="loading-orbit"><span /><span /><span /></div><span className="workspace-eyebrow">PROCESSING MOCK DATA</span><h3>{stage === 1 ? '正在整理户型资料' : '正在生成全屋方案'}</h3><p>这是前端原型演示，真实 AI 工作流接入后会在这里展示进度。</p></section>}
        {resultVisible && <section className="result-board"><div className="result-board-head"><div><span className="workspace-eyebrow">PRESENTATION BOARD / MOCK RESULT</span><h3>{activeStyle.name} · 全屋方案预览</h3><p>基于已确认的 4 个空间生成的方案示意。</p></div><button className="quiet-button" onClick={() => { setResultVisible(false); setStage(3); }}><Icon name="refresh" />换一套风格</button></div><div className="result-cover"><img src={activeStyle.image} alt={`${activeStyle.name}全屋方案封面`} /><div><span>方案总览</span><strong>把空间关系，整理成家的表达</strong></div></div><div className="result-summary"><span><b>户型识别</b>4 个空间</span><span><b>设计风格</b>{activeStyle.name}</span><span><b>输出内容</b>效果图 + 汇报方案</span></div><div className="result-room-grid">{rooms.map((room, index) => <article key={room.name}><img src={[modernLivingImage, nordicBedroomImage, modernKitchenImage, creamCompactImage][index]} alt={`${room.name}方案效果`} /><div><strong>{room.name}</strong><small>{activeStyle.note} · {room.area}</small></div></article>)}</div></section>}
      </main>
    </div>
  );
}
