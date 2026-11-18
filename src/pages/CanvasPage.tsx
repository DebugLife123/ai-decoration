import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { App, Button, ConfigProvider, Select } from 'antd';
import zhCN from 'antd/es/locale/zh_CN';
import localforage from 'localforage';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from 'zustand';
import { AudioLines, CheckCircle2, ClipboardList, FileImage, History, ImagePlus, Layers3, LogOut, Plus, Upload, Video } from 'lucide-react';
import { nanoid } from 'nanoid';
import {
  CanvasEditor, CanvasHostContext, CanvasTaskStatusPanel, CanvasWorkbenchLayout, createCanvasHttpImageGeneration, defaultCanvasGenerationPreferences,
  type CanvasEditorAssetCommand, type CanvasHost, type CanvasHostTaskRecord, type CanvasProjectAsset, type CanvasVersion,
} from '@infinite-canvas/core';
import { CANVAS_ASSET_DRAG_MIME, serializeCanvasAssetDragData } from '@infinite-canvas/core/asset-library';
import { createMockCanvasAdapter, type CanvasMockPersistenceSnapshot } from '@infinite-canvas/core/mock';
import { createMockCanvasWorkflow } from '@infinite-canvas/core/mock-workflow';
import { canvasThemes } from '@infinite-canvas/core/canvas-theme';
import { getAntThemeConfig } from '@infinite-canvas/core/theme';
import { useThemeStore } from '@infinite-canvas/core/theme-store';
import { useAppStore } from '../stores/appStore';
import { gatewayIdentityHeaders } from '../services/credits';
import sampleRoom from '../assets/generated/template-modern-living.png';
import './CanvasPage.css';
import '@infinite-canvas/core/styles.css';
import 'antd/dist/reset.css';
import '@infinite-canvas/core/i18n';

function createCanvasPersistence(userId: string) {
  const key = `jianyizhuang-canvas-projects:${userId}`;
  return { load: () => localforage.getItem<CanvasMockPersistenceSnapshot>(key), save: (snapshot: CanvasMockPersistenceSnapshot) => localforage.setItem(key, snapshot).then(() => undefined) };
}

function createCanvasMedia(adapter: ReturnType<typeof createMockCanvasAdapter>) {
  return {
    ...adapter.media,
    async readImage(projectId: string, image: Parameters<typeof adapter.media.readImage>[1], signal: AbortSignal) { return image.dataUrl.startsWith('data:image/') ? adapter.media.readImage(projectId, image, signal) : readImageAsDataUrl(image.dataUrl, signal); },
    async readMedia(projectId: string, reference: Parameters<typeof adapter.media.readMedia>[1], signal: AbortSignal) { if (reference.assetId || reference.url?.startsWith('data:')) return adapter.media.readMedia(projectId, reference, signal); if (!reference.url) throw new Error(`无法读取素材：${reference.name}`); const response = await fetch(reference.url, { signal }); if (!response.ok) throw new Error(`素材读取失败（${response.status}）`); return response.blob(); },
  };
}

async function readImageAsDataUrl(source: string, signal: AbortSignal) {
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error(`图片读取失败（${response.status}）`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片转换失败')); reader.onerror = () => reject(new Error('图片转换失败')); reader.readAsDataURL(blob); });
}

const imageGeneration = createCanvasHttpImageGeneration({ headers: gatewayIdentityHeaders });

function CanvasWorkspace({ projectId, adapter, workflow }: { projectId: string; adapter: ReturnType<typeof createMockCanvasAdapter>; workflow: ReturnType<typeof createMockCanvasWorkflow> }) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const colorTheme = useThemeStore((state) => state.theme);
  const theme = canvasThemes[colorTheme];
  const projects = useStore(adapter.projects, (state) => state.projects);
  const activeProject = projects.find((project) => project.id === projectId);
  const [assets, setAssets] = useState<CanvasProjectAsset[]>([]);
  const [versions, setVersions] = useState<CanvasVersion[]>([]);
  const [taskRecords, setTaskRecords] = useState<CanvasHostTaskRecord[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [assetFilter, setAssetFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO'>('ALL');
  const [rightTab, setRightTab] = useState<'design' | 'history'>('design');
  const [workMode, setWorkMode] = useState<'generate' | 'adjust'>('generate');
  const [spaceType, setSpaceType] = useState('客厅');
  const [styleDirection, setStyleDirection] = useState('自然木色');
  const [assetCommand, setAssetCommand] = useState<CanvasEditorAssetCommand>();
  const [busy, setBusy] = useState(false);
  const [loadingProject, setLoadingProject] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProjectRef = useRef(projectId);
  activeProjectRef.current = projectId;

  const onTaskRecordChange = useCallback((record: CanvasHostTaskRecord) => { setTaskRecords((current) => [record, ...current.filter((item) => item.task.taskId !== record.task.taskId)]); setSelectedTaskId(record.task.taskId); }, []);
  const loadProject = useCallback(async () => { setLoadingProject(true); try { const loaded = await workflow.loadProject(projectId); setAssets(loaded.assets); setVersions(loaded.versions); setTaskRecords(loaded.tasks.map((task) => ({ task, title: task.type === 'EDIT' ? '方案调整' : '空间方案生成' }))); setSelectedTaskId(loaded.tasks[0]?.taskId || ''); setSelectedAssetId(loaded.assets.find((asset) => asset.kind === 'IMAGE')?.assetId || ''); } catch (error) { message.error(error instanceof Error ? error.message : '项目加载失败'); } finally { setLoadingProject(false); } }, [message, projectId, workflow]);
  useEffect(() => { void loadProject(); }, [loadProject]);

  const media = useMemo(() => createCanvasMedia(adapter), [adapter]);
  const host = useMemo<CanvasHost>(() => ({ ...adapter.hostAdapters, projectId, mode: 'local', editorChrome: false, navigate, searchParams, colorTheme, setColorTheme: (nextTheme) => useThemeStore.getState().setTheme(nextTheme), media, imageGeneration, generationPreferences: { ...defaultCanvasGenerationPreferences, imageModel: 'main-project-ai-gateway', model: 'main-project-ai-gateway', modelCapabilities: { 'main-project-ai-gateway': 'image' } }, config: { isReady: () => true, openSettings: () => message.info('图像模型由主项目服务端配置，请检查 AI 网关环境变量。') }, importImage: (targetProjectId, file, signal) => workflow.importImage(targetProjectId, file, signal), importVideo: (targetProjectId, file, signal) => workflow.importVideo(targetProjectId, file, signal), importAudio: (targetProjectId, file, signal) => workflow.importAudio(targetProjectId, file, signal), assetLibrary: workflow.createAssetLibrary(projectId), assetCommand, taskRecords, onTaskRecordChange }), [adapter, assetCommand, colorTheme, media, message, navigate, onTaskRecordChange, projectId, searchParams, taskRecords, workflow]);

  const importAsset = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setBusy(true); try { const controller = new AbortController(); const asset = file.type.startsWith('image/') ? await workflow.importImage(projectId, file, controller.signal) : file.type.startsWith('video/') ? await workflow.importVideo(projectId, file, controller.signal) : await workflow.importAudio(projectId, file, controller.signal); setAssets((current) => current.some((item) => item.assetId === asset.assetId) ? current : [...current, asset]); if (asset.kind === 'IMAGE') setSelectedAssetId(asset.assetId); message.success('素材已加入当前项目'); } catch (error) { message.error(error instanceof Error ? error.message : '素材上传失败'); } finally { setBusy(false); } };
  const queryTask = async () => { const current = taskRecords.find((record) => record.task.taskId === selectedTaskId); if (!current || current.task.status === 'SUCCEEDED' || current.task.status === 'FAILED') return; setBusy(true); try { const update = await workflow.updateTask(current.task.taskId, { projectId, taskId: current.task.taskId }, { signal: new AbortController().signal, isCurrent: () => activeProjectRef.current === projectId }); if (!update) return; setTaskRecords((records) => records.map((record) => record.task.taskId === current.task.taskId ? { ...record, task: update.task } : record)); if (update.assets) setAssets(update.assets); if (update.versions) setVersions(update.versions); if (update.assetCommand) setAssetCommand(update.assetCommand); } catch (error) { message.error(error instanceof Error ? error.message : '任务查询失败'); } finally { setBusy(false); } };

  const filteredAssets = assetFilter === 'ALL' ? assets : assets.filter((asset) => asset.kind === assetFilter);
  const selectedTask = taskRecords.find((record) => record.task.taskId === selectedTaskId)?.task;
  const startAssetDrag = (event: DragEvent<HTMLButtonElement>, asset: CanvasProjectAsset) => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(CANVAS_ASSET_DRAG_MIME, serializeCanvasAssetDragData({ projectId: asset.projectId, assetId: asset.assetId })); event.dataTransfer.setData('text/plain', asset.name); };
  const selectAsset = (asset: CanvasProjectAsset, versionId?: string) => { if (asset.kind === 'IMAGE') setSelectedAssetId(asset.assetId); setAssetCommand({ requestId: nanoid(), asset, versionId }); };
  const createProject = async () => { try { const project = await workflow.createProject(`新建空间方案 ${projects.length + 1}`); navigate(`/canvas/${project.projectId}`); } catch (error) { message.error(error instanceof Error ? error.message : '新建方案失败'); } };

  const leftPanel = <><div className="canvas-page-section-header" style={{ borderColor: theme.toolbar.border }}><div><h1>空间概况</h1><span>{versions.length ? `第 ${versions.length} 版` : '当前草稿'}</span></div><p>{spaceType} · {styleDirection}</p><small>{assets.length} 个素材 · {activeProject?.nodes.length ?? 0} 个对象</small></div><div className="canvas-page-assets"><div className="canvas-page-assets-title"><h2>参考素材</h2><Button type="text" size="small" loading={busy} icon={<Upload />} aria-label="上传设计素材" title="上传设计素材" onClick={() => fileInputRef.current?.click()} /></div><input ref={fileInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" hidden onChange={(event) => void importAsset(event)} /><div className="canvas-page-filters">{([{ value: 'ALL', label: '全部' }, { value: 'IMAGE', label: '图片' }, { value: 'VIDEO', label: '视频' }, { value: 'AUDIO', label: '音频' }] as const).map((filter) => <button key={filter.value} type="button" aria-pressed={assetFilter === filter.value} style={{ color: assetFilter === filter.value ? theme.node.text : theme.node.muted, background: assetFilter === filter.value ? theme.toolbar.activeBg : 'transparent' }} onClick={() => setAssetFilter(filter.value)}>{filter.label}</button>)}</div><div className="canvas-page-asset-grid">{loadingProject ? <p>正在读取项目素材…</p> : filteredAssets.length ? filteredAssets.map((asset) => <button key={asset.assetId} type="button" draggable onDragStart={(event) => startAssetDrag(event, asset)} onClick={() => selectAsset(asset)} aria-pressed={selectedAssetId === asset.assetId} className="canvas-page-asset" style={{ borderColor: selectedAssetId === asset.assetId ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}>{asset.kind === 'IMAGE' ? <img src={asset.url} alt={asset.name} draggable={false} /> : <span className="canvas-page-asset-placeholder">{asset.kind === 'VIDEO' ? <Video /> : <AudioLines />}<small>{asset.kind === 'VIDEO' ? '视频素材' : '音频素材'}</small></span>}<span title={asset.name}>{asset.name}</span></button>) : <div className="canvas-page-empty"><FileImage /><p>还没有设计素材</p><Button type="text" size="small" icon={<ImagePlus />} onClick={() => fileInputRef.current?.click()}>添加素材</Button></div>}</div></div></>;
  const rightPanel = <><div className="canvas-page-tabs" style={{ borderColor: theme.toolbar.border }}><button type="button" aria-pressed={rightTab === 'design'} onClick={() => setRightTab('design')}>方案设计</button><button type="button" aria-pressed={rightTab === 'history'} onClick={() => setRightTab('history')}><ClipboardList />任务与版本</button></div>{rightTab === 'design' ? <div className="canvas-page-right-content"><div className="canvas-page-brief"><label>空间类型<Select size="small" value={spaceType} options={['客厅', '卧室', '餐厨', '书房'].map((value) => ({ value, label: value }))} onChange={setSpaceType} /></label></div><div className="canvas-page-work-mode"><span>工作方式</span><div role="group" aria-label="工作方式" style={{ background: theme.toolbar.activeBg }}>{([{ value: 'generate', label: '生成新方案' }, { value: 'adjust', label: '调整方案' }] as const).map((option) => <button key={option.value} type="button" aria-pressed={workMode === option.value} onClick={() => setWorkMode(option.value)} style={workMode === option.value ? { background: theme.toolbar.panel, color: theme.node.text } : undefined}>{option.label}</button>)}</div></div><div className="canvas-page-style-row"><span>风格方向</span><strong>{styleDirection}</strong></div><div className="canvas-page-style-options">{['自然木色', '奶油极简', '现代留白', '低饱和绿'].map((value) => <button key={value} type="button" aria-pressed={styleDirection === value} onClick={() => setStyleDirection(value)}>{value}</button>)}</div></div> : <div className="canvas-page-right-content"><div className="canvas-page-task-list"><CanvasTaskStatusPanel nodes={activeProject?.nodes ?? []} taskRecords={taskRecords} /></div>{taskRecords.length ? <><Select className="canvas-page-task-select" value={selectedTaskId || undefined} placeholder="选择要查询的任务" options={taskRecords.map(({ task, title }) => ({ value: task.taskId, label: `${title || '空间方案'} · ${task.status}` }))} onChange={setSelectedTaskId} /><Button type="text" block disabled={!selectedTask || selectedTask.status === 'SUCCEEDED' || selectedTask.status === 'FAILED'} loading={busy} onClick={() => void queryTask()}>查询所选任务</Button></> : null}<div className="canvas-page-versions"><div className="canvas-page-versions-title"><h3>方案版本</h3><span>{versions.length}</span></div>{versions.length ? versions.map((version, index) => { const asset = assets.find((item) => item.assetId === version.resultAssetId); return <button key={version.versionId} type="button" onClick={() => asset && selectAsset(asset, version.versionId)}>{asset ? <img src={asset.url} alt="" /> : <History />}<span>{version.name}</span><small>第 {versions.length - index} 版</small></button>; }) : null}</div></div>}</>;
  return <CanvasWorkbenchLayout theme={theme} headerStart={<><div className="canvas-page-mark"><Layers3 /></div><strong className="canvas-page-brand">简艺装</strong><i /><div className="canvas-page-project"><Select variant="borderless" size="small" value={projectId} options={projects.map((project) => ({ value: project.id, label: project.title }))} onChange={(nextProjectId) => navigate(`/canvas/${nextProjectId}`)} aria-label="当前设计项目" /></div></>} headerEnd={<><span className="canvas-page-status"><CheckCircle2 />{loadingProject ? '读取项目' : busy ? '处理中' : '已就绪'}</span><Button type="text" size="small" icon={<Plus />} aria-label="新建方案" title="新建方案" onClick={() => void createProject()} /><Button type="text" size="small" icon={<LogOut />} aria-label="退出画布" title="退出画布" onClick={() => navigate('/')}>退出画布</Button></>} leftPanel={leftPanel} rightPanel={rightPanel}><CanvasHostContext value={host}><CanvasEditor key={projectId} /></CanvasHostContext></CanvasWorkbenchLayout>;
}

function CanvasPageContent() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const userId = useAppStore((state) => state.authSession?.user.id || 'anonymous');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const colorTheme = useThemeStore((state) => state.theme);
  const adapter = useMemo(() => createMockCanvasAdapter({ projectName: '客厅设计方案', sampleAsset: { name: '现代客厅参考图.png', mimeType: 'image/png', url: sampleRoom, width: 1440, height: 960 }, persistence: createCanvasPersistence(userId) }), [userId]);
  const workflow = useMemo(() => createMockCanvasWorkflow(adapter), [adapter]);
  useEffect(() => { let active = true; void adapter.ready.then(() => { if (!active) return; if (!id) navigate(`/canvas/${adapter.initialProjectId}`, { replace: true }); else void adapter.api.getProject(id).then(() => { if (active) setReady(true); }).catch(() => { if (active) navigate(`/canvas/${adapter.initialProjectId}`, { replace: true }); }); }).catch((error: unknown) => { if (active) setLoadError(error instanceof Error ? error.message : '画布本地项目读取失败'); }); return () => { active = false; }; }, [adapter, id, navigate]);
  return <ConfigProvider locale={zhCN} theme={getAntThemeConfig(colorTheme === 'dark')}><App><div className="canvas-project-page">{loadError ? <div className="canvas-project-loading" role="alert">{loadError}</div> : ready && id ? <CanvasWorkspace projectId={id} adapter={adapter} workflow={workflow} /> : <div className="canvas-project-loading">正在打开画布…</div>}</div></App></ConfigProvider>;
}

export default function CanvasPage() { return <CanvasPageContent />; }
