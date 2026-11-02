import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { templates } from './HomePage';
import { addCadAsset, analyzeCadPlan, approveBirdseye, createCadProject, generateBirdseye, saveCadSnapshot, submitCadQa, updateStyleBrief } from '../services/cadWorkflowClient';
import type { CadProject, QaCheck, StyleBrief } from '../types/cadWorkflow';
import './CadWorkflowPage.css';

type StyleKey = 'modern' | 'song' | 'smallAmerican';
type Upload = { name: string; sizeLabel: string; mimeType: string; dataUrl: string };
const stages = ['资料验收', '风格简报', 'PlanModel', '鸟瞰首件', 'QA 门禁', '鸟瞰锁定'];
const stageIndex: Record<CadProject['stage'], number> = { intake: 0, brief: 1, plan: 2, birdseye: 3, qa: 4, locked: 5 };
const styleOptions = templates.filter((item): item is typeof item & { styleKey: StyleKey } => item.styleKey === 'modern' || item.styleKey === 'song' || item.styleKey === 'smallAmerican');
const styleDetails: Record<StyleKey, { note: string; materials: string[]; furnitureRules: string[]; lighting: string }> = {
  modern: { note: '暖白、浅木、隐藏收纳', materials: ['白橡木饰面', '哑光涂料', '浅色石材'], furnitureRules: ['优先低矮、线性、整合式家具', '保持客餐厅连续动线，柜体尽量整合入墙'], lighting: '3500K-4000K 自然暖白，线性照明与柔和漫射光为主' },
  song: { note: '深木、陶器、东方留白', materials: ['深胡桃木', '手工陶器', '肌理涂料'], furnitureRules: ['陈设疏朗、非对称，保留完整留白面', '避免符号堆叠，家具强调手作质感'], lighting: '3000K-3500K 柔和暖光，强调局部洗墙与材质阴影' },
  smallAmerican: { note: '奶油线框、橄榄绿、复古细节', materials: ['线框烤漆柜门', '深色木地板', '黄铜五金'], furnitureRules: ['家具尺度适配小户型，优先收纳与实用书桌', '线框、黄铜和少量复古软装保持克制呼应'], lighting: '3000K-3500K 暖光，兼顾自然光与局部氛围灯' },
};
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function readImage(file: File) { return new Promise<string>((resolve, reject) => { if (!file.type.startsWith('image/')) return reject(new Error('第一阶段请上传 CAD 导出图片；DWG、DXF、PDF 请先导出为 PNG、JPG 或 WEBP。')); const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败，请重新选择。')); reader.readAsDataURL(file); }); }
function buildBrief(styleKey: StyleKey, revision: string): StyleBrief {
  const template = styleOptions.find((item) => item.styleKey === styleKey) ?? styleOptions[0];
  const detail = styleDetails[styleKey];
  return { id: `brief_${styleKey}`, name: template.style, referenceIds: [template.id], palette: { primary: template.palette.slice(0, 2), secondary: template.palette.slice(2), accent: styleKey === 'smallAmerican' ? ['黄铜'] : styleKey === 'song' ? ['陶土褐'] : ['黑色金属'] }, materials: detail.materials.map((name, index) => ({ id: `${styleKey}_material_${index}`, name, usage: ['墙面', '地面', '柜体'].slice(index, index + 1) })), furnitureRules: detail.furnitureRules, lighting: { colorTemperature: detail.lighting, scene: '日常居住、通透自然、无戏剧化过曝' }, mustKeep: ['CAD 识别出的墙体、门窗、房间邻接和固定设施', '全屋材质与色彩的一致性'], doNotUse: ['文字、水印、人物', '与户型不符的新增门窗和结构', '过度装饰与样板间式堆叠'], revision };
}
function Icon({ name }: { name: 'upload' | 'arrow' | 'check' | 'lock' | 'refresh' | 'file' }) { const paths = { upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></>, arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>, check: <path d="m5 12 4 4L19 6" />, lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>, refresh: <><path d="M20 11a8 8 0 1 0 1 4" /><path d="M20 5v6h-6" /></>, file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></> }; return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>; }

export default function CadWorkflowPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [project, setProject] = useState<CadProject | null>(null);
  const [upload, setUpload] = useState<Upload | null>(null);
  const [projectName, setProjectName] = useState('我的 CAD 全屋项目');
  const [revision, setRevision] = useState('R0');
  const [unit, setUnit] = useState<'mm' | 'unknown'>('mm');
  const [scale, setScale] = useState<'1:1' | 'unknown'>('1:1');
  const [styleKey, setStyleKey] = useState<StyleKey>('modern');
  const [checks, setChecks] = useState<QaCheck[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const activeBrief = useMemo(() => buildBrief(styleKey, revision), [revision, styleKey]);
  const currentStage = project ? stageIndex[project.stage] : 0;
  const cadAsset = project?.assets.find((asset) => asset.kind === 'cad-export');

  const selectFile = async (file?: File) => {
    if (!file) return;
    try { setUpload({ name: file.name, sizeLabel: formatSize(file.size), mimeType: file.type, dataUrl: await readImage(file) }); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : '图片读取失败。'); }
  };
  const createOrUpdateProject = async () => {
    if (project) return project;
    const created = await createCadProject({ name: projectName, revision, unit, scale });
    setProject(created);
    return created;
  };
  const handleUpload = async () => {
    if (!upload) { setMessage('请先上传 CAD 导出图。'); return; }
    setWorking(true); setMessage('');
    try { const current = await createOrUpdateProject(); const updated = await addCadAsset(current.id, { name: upload.name, kind: 'cad-export', mimeType: upload.mimeType, sizeLabel: upload.sizeLabel, dataUrl: upload.dataUrl }); setProject(updated); }
    catch (error) { setMessage(error instanceof Error ? error.message : '资料上传失败。'); }
    finally { setWorking(false); }
  };
  const saveSnapshot = async () => { if (!project) return; setWorking(true); setMessage(''); try { setProject(await saveCadSnapshot(project.id, { revision, unit, scale, confirmations: ['已确认本项目使用 CAD 导出图片作为视觉识别输入', '已确认当前阶段不宣称原生 DWG/DXF 几何解析'] })); } catch (error) { setMessage(error instanceof Error ? error.message : '项目资料保存失败。'); } finally { setWorking(false); } };
  const runPlan = async () => { if (!project || !cadAsset) { setMessage('请先上传 CAD 导出图并保存项目资料。'); return; } setWorking(true); setMessage(''); try { const result = await analyzeCadPlan(project.id, cadAsset.id); setProject(result.project); } catch (error) { setMessage(error instanceof Error ? error.message : 'PlanModel 识别失败。'); } finally { setWorking(false); } };
  const saveBrief = async () => { if (!project) { setMessage('请先完成资料验收。'); return; } setWorking(true); setMessage(''); try { setProject(await updateStyleBrief(project.id, activeBrief)); } catch (error) { setMessage(error instanceof Error ? error.message : '风格简报保存失败。'); } finally { setWorking(false); } };
  const runBirdseye = async () => { if (!project) return; setWorking(true); setMessage(''); try { const result = await generateBirdseye(project.id); setProject(result.project); setChecks(result.project.qa); } catch (error) { setMessage(error instanceof Error ? error.message : '鸟瞰首件生成失败。'); } finally { setWorking(false); } };
  const saveQa = async () => { if (!project) return; setWorking(true); setMessage(''); try { setProject(await submitCadQa(project.id, checks)); } catch (error) { setMessage(error instanceof Error ? error.message : 'QA 提交失败。'); } finally { setWorking(false); } };
  const lockBirdseye = async () => { if (!project) return; setWorking(true); setMessage(''); try { setProject(await approveBirdseye(project.id)); } catch (error) { setMessage(error instanceof Error ? error.message : '鸟瞰锁定失败。'); } finally { setWorking(false); } };
  const updateCheck = (key: QaCheck['key'], status: QaCheck['status']) => setChecks((current) => current.map((item) => item.key === key ? { ...item, status } : item));
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { void selectFile(event.target.files?.[0]); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); };

  return <div className="cad-page"><main className="cad-main"><header className="cad-header"><div><span className="cad-eyebrow">CAD TO WHOLE-HOME RENDERING / PHASE 01</span><h1>CAD 全屋渲染工作流</h1><p>从资料验收开始，先锁定可追溯的 PlanModel 和鸟瞰首件，再进入批量房间生成。</p></div><button className="cad-back" onClick={() => navigate('/workspace')}><Icon name="refresh" />返回原设计流</button></header>
    <div className="cad-alert"><strong>能力边界</strong><span>当前 CAD 模式使用 CAD 导出图片进行视觉识别，尚未完成原生 DWG/DXF 几何解析。</span><span>鸟瞰首件按模型原生输出记录，当前默认 1024×1024，不称为原生 4K。</span></div>
    <nav className="cad-stepper" aria-label="CAD 工作流阶段">{stages.map((label, index) => <span className={`${index === currentStage ? 'active' : ''} ${index < currentStage ? 'done' : ''}`} key={label}><b>{String(index + 1).padStart(2, '0')}</b>{label}</span>)}</nav>
    <section className="cad-layout"><div className="cad-content">
      <section className="cad-panel"><div className="cad-panel-head"><div><span className="cad-kicker">01 / INTAKE</span><h2>资料验收与项目快照</h2></div><span className={`cad-status ${project?.status || 'draft'}`}>{project?.status === 'locked' ? '已锁定' : project?.status === 'blocked' ? '需处理' : '进行中'}</span></div><div className="cad-grid two"><label>项目名称<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label>CAD 修订号<input value={revision} onChange={(event) => setRevision(event.target.value)} /></label><label>图纸单位<select value={unit} onChange={(event) => setUnit(event.target.value as 'mm' | 'unknown')}><option value="mm">mm</option><option value="unknown">未知，待确认</option></select></label><label>图纸比例<select value={scale} onChange={(event) => setScale(event.target.value as '1:1' | 'unknown')}><option value="1:1">1:1</option><option value="unknown">未知，待确认</option></select></label></div><div className={`cad-upload ${upload || cadAsset ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>{upload ? <><span className="cad-file-icon"><Icon name="file" /></span><span><strong>{upload.name}</strong><small>{upload.sizeLabel} · 待提交到项目</small></span></> : cadAsset ? <><img src={cadAsset.dataUrl} alt="CAD 导出图预览" /><span><strong>{cadAsset.name}</strong><small>{cadAsset.sizeLabel} · 已纳入项目快照</small></span></> : <><span className="cad-upload-icon"><Icon name="upload" /></span><strong>拖入 CAD 导出图，或点击选择图片</strong><small>支持 PNG、JPG、WEBP；DWG / DXF / PDF 请先导出为图片</small></>}<input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleChange} /></div><div className="cad-actions"><button className="cad-secondary" onClick={() => void saveSnapshot()} disabled={!project || working}>保存项目快照</button><button className="cad-primary" onClick={() => void handleUpload()} disabled={!upload || working}>{working ? '处理中…' : '纳入 CAD 资料'} <Icon name="arrow" /></button></div></section>
      <section className="cad-panel"><div className="cad-panel-head"><div><span className="cad-kicker">02 / STYLE BRIEF</span><h2>选择并保存风格简报</h2></div><span className="cad-panel-note">三套已验证模板</span></div><div className="cad-style-grid">{styleOptions.map((style) => <button key={style.styleKey} className={`cad-style-card ${styleKey === style.styleKey ? 'selected' : ''}`} onClick={() => setStyleKey(style.styleKey)}><img src={style.image} alt={`${style.style}参考`} /><span><strong>{style.style}</strong><small>{styleDetails[style.styleKey].note}</small></span>{styleKey === style.styleKey && <i><Icon name="check" /></i>}</button>)}</div><div className="cad-brief-preview"><span><b>色彩</b>{activeBrief.palette.primary.join(' · ')}</span><span><b>材质</b>{activeBrief.materials.map((item) => item.name).join(' · ')}</span><span><b>灯光</b>{activeBrief.lighting.colorTemperature}</span></div><button className="cad-primary" onClick={() => void saveBrief()} disabled={!project || working}>保存风格简报 <Icon name="arrow" /></button></section>
      <section className="cad-panel"><div className="cad-panel-head"><div><span className="cad-kicker">03 / PLANMODEL</span><h2>识别结构并确认</h2></div><span className="cad-panel-note">结构化 JSON 门禁</span></div>{project?.planModel ? <><div className="cad-stat-row"><span><b>{project.planModel.rooms.length}</b>空间</span><span><b>{project.planModel.walls.length}</b>墙体</span><span><b>{project.planModel.openings.length}</b>门窗</span><span><b>{project.planModel.uncertainties.length}</b>待确认</span></div><div className="cad-room-list">{project.planModel.rooms.map((room) => <div key={room.id}><strong>{room.name}</strong><span>{room.description}</span><em>{room.status} / {room.confidence === null ? '未给出置信度' : `${Math.round(room.confidence * 100)}%`}</em></div>)}</div>{project.planModel.uncertainties.length > 0 && <p className="cad-warning">待确认：{project.planModel.uncertainties.join('；')}</p>}</> : <div className="cad-empty">上传资料后，系统才会生成 PlanModel。模型缺字段或 JSON 解析失败时会直接阻断，不会伪造结构数据。</div>}<button className="cad-primary" onClick={() => void runPlan()} disabled={!project || !cadAsset || working}>识别 CAD 并生成 PlanModel <Icon name="arrow" /></button></section>
      <section className="cad-panel"><div className="cad-panel-head"><div><span className="cad-kicker">04 / BIRDSEYE FIRST ARTICLE</span><h2>生成鸟瞰概念首件</h2></div><span className="cad-panel-note">先首件，后批量</span></div>{project?.birdseye ? <div className="cad-birdseye"><img src={project.birdseye.imageUrl} alt="CAD 鸟瞰概念首件" /><div><strong>{project.birdseye.promptSummary}</strong><span>实际输出 {project.birdseye.finalWidth} × {project.birdseye.finalHeight} · 原生 {project.birdseye.nativeWidth} × {project.birdseye.nativeHeight}</span><small>目标规格 3840 × 2160；当前不是原生 4K，未做拉伸冒充。</small></div></div> : <div className="cad-empty">需要同时具备 PlanModel、StyleBrief 和 CAD 导出图，才允许生成鸟瞰首件。</div>}<button className="cad-primary" onClick={() => void runBirdseye()} disabled={!project?.planModel || !project?.styleBrief || working}>生成鸟瞰首件 <Icon name="arrow" /></button></section>
      <section className="cad-panel"><div className="cad-panel-head"><div><span className="cad-kicker">05 / QA GATE</span><h2>结构、风格、像素三维 QA</h2></div><span className="cad-panel-note">三项全部通过才能锁定</span></div><div className="cad-qa-list">{(checks.length ? checks : project?.qa || []).map((item) => <div className="cad-qa-row" key={item.key}><div><strong>{item.label}</strong><p>{item.note}</p></div><select value={item.status} onChange={(event) => updateCheck(item.key, event.target.value as QaCheck['status'])}><option value="pending">待检查</option><option value="pass">通过</option><option value="fail">不通过</option><option value="unverifiable">不可核验</option></select></div>)}</div>{project?.birdseye && <button className="cad-primary" onClick={() => void saveQa()} disabled={!project || !checks.length || working}>提交 QA 结果 <Icon name="check" /></button>}</section>
      <section className="cad-panel cad-lock-panel"><div><span className="cad-kicker">06 / LOCK</span><h2>锁定鸟瞰首件</h2><p>锁定后，这张首件将作为后续房间视角、材质和色彩一致性的基准。</p></div><button className="cad-primary" onClick={() => void lockBirdseye()} disabled={project?.gate.birdseye === 'approved' || project?.qa.some((item) => item.status !== 'pass') || working}>{project?.gate.birdseye === 'approved' ? '鸟瞰已锁定' : <>通过门禁并锁定 <Icon name="lock" /></>}</button></section>
      {message && <p className="cad-message">{message}</p>}
    </div><aside className="cad-sidebar"><div className="cad-side-block"><span className="cad-kicker">PROJECT RECORD</span><h3>{project?.name || projectName}</h3><dl><div><dt>项目 ID</dt><dd>{project?.id || '创建资料后生成'}</dd></div><div><dt>来源</dt><dd>CAD 导出图片</dd></div><div><dt>原生解析</dt><dd>未接入 DWG/DXF</dd></div><div><dt>修订号</dt><dd>{revision}</dd></div><div><dt>当前阶段</dt><dd>{stages[currentStage]}</dd></div></dl></div><div className="cad-side-block"><span className="cad-kicker">GATE STATUS</span><div className="cad-gate"><span className={project?.gate.birdseye === 'approved' ? 'pass' : ''}><Icon name="lock" />鸟瞰锁定</span><b>{project?.gate.birdseye === 'approved' ? 'APPROVED' : 'PENDING'}</b></div><p>后续房间图批量生成、局部修复和全景输出会依赖这项门禁。</p></div><div className="cad-side-block"><span className="cad-kicker">HANDOFF NOTES</span><ul><li>资料与修订号先形成项目快照。</li><li>结构识别结果必须是完整 PlanModel。</li><li>鸟瞰输出记录原生尺寸和目标尺寸。</li><li>未通过 QA 时，不进入后续批量生成。</li></ul></div></aside></section>
  </main></div>;
}
