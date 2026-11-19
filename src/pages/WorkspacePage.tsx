import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppStore, type DesignStyle } from '../stores/appStore';
import { analyzeFloorPlan, editRoomImage, generateDesign, resumeGenerationJob, retryGenerationRooms, toSupportedImageDataUrl, type GenerationJob, type IdentifiedRoom, type PlanSource } from '../services/aiClient';
import { clearRunningSnapshot, deleteDesignHistory, listDesignHistory, loadRunningSnapshot, saveDesignHistory, saveRunningSnapshot, type DesignHistoryRecord } from '../services/designHistory';
import { loadBudgetSnapshot } from '../services/budgetSnapshot';
import RoomImageEditor, { type RoomImageVersion } from '../components/RoomImageEditor';
import { templates } from '../features/styleLibrary/inspirationTemplates';
import { createPersistentGenerationTask, failPersistentGenerationTask, finishPersistentGenerationTask, getPersistentGenerationTask, hasPersistentWorkspaceSession, persistWorkspaceProject, startPersistentGenerationTask, updatePersistentGenerationTask } from '../services/workspaceData';
import { clearActiveGeneration, isActiveGenerationFresh, patchActiveGeneration, readActiveGeneration, writeActiveGeneration } from '../services/generationTracker';
import type { Project, DesignVersion, GenerationTask } from '../services/dataContracts';
import { createId } from '../utils/id';
import './WorkspacePage.css';

type Stage = 1 | 2 | 3 | 4;
type UploadedFile = { name: string; size: string; preview: string };
type PlanImageMeta = { sourceWidth: number; sourceHeight: number; sentWidth: number; sentHeight: number; sourceBytes: number };
type WorkKind = 'recognizing' | 'generating' | null;
type GenerationInput = { analysis: string; rooms: IdentifiedRoom[]; selectedRooms: string[] };
type GenerationContext = { floorPlan: string; source: PlanSource; style: DesignStyle; imageMeta?: PlanImageMeta };
type GeneratePlanRunner = (input: GenerationInput, taskId: string, baseProject: Project, context?: GenerationContext) => Promise<void>;
type ReportResult = { name: string; imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string }; versions?: RoomImageVersion[]; currentVersionId?: string };
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
const styleOptions = templates.map((template) => ({ ...template, key: template.styleKey, name: template.style, note: styleNotes[template.styleKey] ?? template.style, details: reportDetails[template.styleKey] ?? { subtitle: template.analysis, principles: template.ruleItems.map((item) => ({ title: item.label, body: item.value })), notes: ['效果图用于方案沟通，实际尺寸、材质与结构请结合现场复核。'] } }));
function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function newId() { return createId(); }
function readImage(file: File) { return new Promise<{ data: string; meta: PlanImageMeta }>((resolve, reject) => {
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
      resolve({ data: canvas.toDataURL('image/jpeg', 0.92), meta: { sourceWidth: image.naturalWidth, sourceHeight: image.naturalHeight, sentWidth: canvas.width, sentHeight: canvas.height, sourceBytes: file.size } });
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}); }

function makeRoomReferenceCrop(source: string, bounds: NonNullable<IdentifiedRoom['bounds']>) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('户型图局部裁切失败。'));
    image.onload = () => {
      const rawLeft = Math.max(0, Math.floor(bounds.x * image.naturalWidth));
      const rawTop = Math.max(0, Math.floor(bounds.y * image.naturalHeight));
      const rawWidth = Math.max(1, Math.floor(bounds.width * image.naturalWidth));
      const rawHeight = Math.max(1, Math.floor(bounds.height * image.naturalHeight));
      // 保留少量相邻墙体和开口，帮助模型判断边界，但不把整张户型图再次拼进来。
      const paddingX = Math.max(12, Math.floor(rawWidth * 0.12));
      const paddingY = Math.max(12, Math.floor(rawHeight * 0.12));
      const left = Math.max(0, rawLeft - paddingX);
      const top = Math.max(0, rawTop - paddingY);
      const right = Math.min(image.naturalWidth, rawLeft + rawWidth + paddingX);
      const bottom = Math.min(image.naturalHeight, rawTop + rawHeight + paddingY);
      const cropWidth = Math.max(1, right - left);
      const cropHeight = Math.max(1, bottom - top);
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(cropWidth, cropHeight));
      const canvas = document.createElement('canvas');
      const width = Math.max(1, Math.round(cropWidth * scale));
      const height = Math.max(1, Math.round(cropHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('无法创建空间参考图。'));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    }; image.src = source;
  });
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedStyle, setSelectedStyle, loadProjects } = useAppStore();
  const routeSourceType: PlanSource = searchParams.get('source') === 'floorplan' ? 'floorplan' : 'cad';
  const [sourceOverride, setSourceOverride] = useState<{ route: PlanSource; value: PlanSource } | null>(null);
  const sourceType = sourceOverride?.route === routeSourceType ? sourceOverride.value : routeSourceType;
  const [stage, setStage] = useState<Stage>(1);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [imageData, setImageData] = useState('');
  const [imageMeta, setImageMeta] = useState<PlanImageMeta | null>(null);
  const [rooms, setRooms] = useState<IdentifiedRoom[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [results, setResults] = useState<ReportResult[]>([]);
  const [history, setHistory] = useState<DesignHistoryRecord[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [editingRoomIndex, setEditingRoomIndex] = useState<number | null>(null);
  const [historyMessage, setHistoryMessage] = useState('');
  const [workKind, setWorkKind] = useState<WorkKind>(null);
  const [workElapsed, setWorkElapsed] = useState(0);
  const [generationProgress, setGenerationProgress] = useState<GenerationJob | null>(null);
  const [generationJobId, setGenerationJobId] = useState<string | null>(null);
  const [taskRecoveryError, setTaskRecoveryError] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const recoveryTaskRef = useRef<string | null>(null);
  /** Task started by this tab; keeps the mount-recovery effect from hijacking a live run. */
  const activeTaskRef = useRef<string | null>(null);
  /** Tasks already handed to the recovery flow in this mount, so it retries once at most. */
  const recoveredTaskRef = useRef<Set<string>>(new Set());
  /** Throttles progress writes to the tracker. */
  const progressTrackerRef = useRef(0);
  const generatePlanRef = useRef<GeneratePlanRunner | null>(null);
  const savedProjects = useAppStore((state) => state.projects);
  const isWorking = workKind !== null;
  const totalRoomsForProgress = generationProgress?.totalRooms ?? (selectedRooms.length || 1);
  // Recognition and generation are separate phases, so the bar is a staged estimate
  // (0-20 recognition, 25-95 room generation) rather than a raw model percentage.
  const livePercent = workKind === 'recognizing'
    ? Math.min(20, 6 + Math.floor(workElapsed / 3))
    : workKind === 'generating'
      ? Math.min(96, 25 + Math.round(70 * Math.min(1, (generationProgress?.completedRooms ?? 0) / Math.max(totalRoomsForProgress, 1))))
      : 0;
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const requestedStyle = searchParams.get('style');
  const routeStyle = styleOptions.some((style) => style.key === requestedStyle) ? requestedStyle as DesignStyle : null;
  const [styleOverride, setStyleOverride] = useState<{ route: string | null; value: DesignStyle } | null>(null);
  const workflowStyle = styleOverride?.route === requestedStyle ? styleOverride.value : routeStyle ?? selectedStyle;
  const activeStyle = useMemo(() => styleOptions.find((style) => style.key === workflowStyle) ?? styleOptions[0], [workflowStyle]);
  const routeMatchesStyle = routeStyle === activeStyle.key;
  const preferences = [['色调', searchParams.get('tone')], ['光线', searchParams.get('light')], ['材质', searchParams.get('material')]].filter((entry): entry is [string, string] => routeMatchesStyle && Boolean(entry[1]));
  const authUserId = useAppStore((state) => state.authSession?.user.id || 'anonymous');
  const budgetSnapshot = useMemo(() => loadBudgetSnapshot(authUserId), [authUserId]);
  const hasRouteTemplate = searchParams.has('template') || searchParams.has('style');

  useEffect(() => {
    void listDesignHistory().then(setHistory).catch((error: unknown) => {
      setHistoryMessage(error instanceof Error ? error.message : '读取本地方案记录失败。');
    });
  }, []);

  useEffect(() => {
    const requestedProject = searchParams.get('projectId');
    const requestedVersion = searchParams.get('versionId');
    if (searchParams.get('taskId')) return;
    if (!requestedProject || !savedProjects.length) return;
    const project = savedProjects.find((item) => item.id === requestedProject);
    const version = project?.versions.find((item) => item.id === requestedVersion) || project?.versions.at(-1);
    if (!project || !version) return;
    const record: DesignHistoryRecord = {
      id: version.id, name: `${project.name} · ${new Date(version.createdAt).toLocaleDateString('zh-CN')}`, createdAt: version.createdAt,
      style: version.style, source: version.source || 'floorplan', floorPlan: project.floorPlanUrl || '', analysis: version.floorPlanAnalysis || version.analysis,
      rooms: version.identifiedRooms || [], selectedRooms: version.selectedRooms || [], warning: version.warning,
      generationJobId: version.taskId,
      results: [{ name: '全屋总览', imageUrl: version.coverImageUrl }, ...version.images.map((image) => ({ name: image.title, imageUrl: image.imageUrl, review: undefined }))],
    };
    setProjectId(project.id);
    setFile(null);
    setImageData(record.floorPlan);
    setRooms(record.rooms);
    setSelectedRooms(record.selectedRooms);
    setResults(record.results);
    setGenerationJobId(version.taskId || null);
    setStyleOverride({ route: requestedStyle, value: version.style });
    setSelectedStyle(version.style);
    setActiveHistoryId(record.id);
    setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setStage(4);
  }, [searchParams, savedProjects, requestedStyle, setSelectedStyle]);

  const recoverPersistentTask = useCallback(async (project: Project, task: GenerationTask, isActive: () => boolean) => {
    if (recoveryTaskRef.current === task.id) return;
    recoveryTaskRef.current = task.id;
    setProjectId(project.id);
    setImageData(project.floorPlanUrl || '');
    setStyleOverride({ route: requestedStyle, value: task.style });
    setSelectedStyle(task.style);
    setSourceOverride({ route: routeSourceType, value: project.spaceType.startsWith('CAD') ? 'cad' : 'floorplan' });
    setStage(2);
    setTaskRecoveryError('');
    setWorkKind(task.status === 'generating' ? task.prompt.toLowerCase().includes('floor plan recognition') ? 'recognizing' : 'generating' : null);
    setMessage('');
    try {
      let remote: Record<string, unknown> = {};
      if (hasPersistentWorkspaceSession()) {
        try {
          remote = await getPersistentGenerationTask(task.id);
        } catch (error) {
          // 项目任务接口短暂不可用时，仍然可以用本地阶段和 AI 网关任务继续恢复。
          console.warn('Could not load persistent task state; falling back to the local task snapshot.', error);
        }
      }
      const partial = remote.result && typeof remote.result === 'object' ? remote.result as Record<string, unknown> : {};
      const partialRooms: NonNullable<GenerationJob['rooms']> = Array.isArray(partial.rooms) ? partial.rooms as NonNullable<GenerationJob['rooms']> : [];
      const remoteStatus = String(remote.status || '').toUpperCase();
      const remoteStage = String(remote.stage || '').toLowerCase();
      if ((task.status === 'failed' && remoteStatus !== 'SUCCEEDED') || remoteStatus === 'FAILED') {
        const partialResults: ReportResult[] = [
          ...(typeof partial.cover === 'string' ? [{ name: '全屋总览', imageUrl: partial.cover }] : []),
          ...partialRooms.map((room) => ({ name: room.name, imageUrl: room.imageUrl, review: room.review })),
        ];
        const errorMessage = String(task.error || remote.error || '任务已失败，可重新上传后发起新任务。');
        setGenerationJobId(task.id);
        setGenerationProgress({
          id: task.id, requestId: task.id, status: 'failed', stage: String(remote.stage || 'failed'),
          message: String(remote.progressMessage || errorMessage),
          completedRooms: Number(remote.completedRooms || partialRooms.length),
          totalRooms: Number(remote.totalRooms || partialRooms.length),
          coverReady: Boolean(partial.cover), rooms: partialRooms, cover: typeof partial.cover === 'string' ? partial.cover : undefined,
          failedRooms: Array.isArray(partial.failedRooms) ? partial.failedRooms as string[] : undefined,
          error: errorMessage,
        });
        setResults(partialResults);
        setTaskRecoveryError(errorMessage);
        setMessage('');
        clearActiveGeneration(task.id);
        void clearRunningSnapshot(task.id).catch(() => undefined);
        return;
      }
      const taskSource = project.spaceType.startsWith('CAD') ? 'cad' : 'floorplan';
      const persistedStage = task.stage || remoteStage;
      const shouldResumeRecognition = task.status === 'generating'
        && (persistedStage === 'queued' || persistedStage === 'recognizing' || persistedStage === 'plan-analysis');
      if (shouldResumeRecognition) {
        const snapshot = await loadRunningSnapshot(task.id).catch(() => null);
        const floorPlan = snapshot?.floorPlan || await toSupportedImageDataUrl(project.floorPlanUrl || '');
        setImageData(floorPlan);
        // Local sessions have no backend analysis row: reuse the IndexedDB snapshot so a
        // reload never pays for a second recognition pass.
        const recognized: GenerationInput = snapshot?.analysis && snapshot.rooms?.length
          ? { analysis: snapshot.analysis, rooms: snapshot.rooms, selectedRooms: snapshot.selectedRooms?.length ? snapshot.selectedRooms : snapshot.rooms.map((room) => room.name) }
          : await analyzeFloorPlan(floorPlan, taskSource).then((analysis) => ({
              analysis: analysis.analysis, rooms: analysis.rooms, selectedRooms: analysis.rooms.map((room) => room.name),
            }));
        await updatePersistentGenerationTask(task.id, { stage: 'generating', progress: 20, message: '户型空间识别完成，正在准备全屋效果图', completedRooms: 0, totalRooms: recognized.rooms.length });
        setRooms(recognized.rooms);
        setSelectedRooms(recognized.selectedRooms);
        const runGeneration = generatePlanRef.current;
        if (!runGeneration) throw new Error('生成工作流尚未准备好，请稍后重试。');
        await runGeneration(recognized, task.id, project, { floorPlan, source: taskSource, style: task.style });
        return;
      }
      const previous = {
        type: 'floorplan' as const,
        cover: typeof partial.cover === 'string' ? partial.cover : '',
        analysis: typeof partial.analysis === 'string' ? partial.analysis : '',
        rooms: partialRooms,
      };
      const reportProgress = (job: GenerationJob) => {
        if (!isActive()) return;
        setWorkKind('generating');
        setGenerationProgress(job);
        const now = Date.now();
        if (now - progressTrackerRef.current > 3000) {
          progressTrackerRef.current = now;
          patchActiveGeneration({
            stage: job.stage, message: job.message,
            completedRooms: job.completedRooms, totalRooms: job.totalRooms,
          });
        }
        void updatePersistentGenerationTask(task.id, {
          stage: job.stage || 'generating', progress: 25 + Math.floor(70 * Math.min(1, job.completedRooms / Math.max(job.totalRooms, 1))),
          message: job.message || '正在恢复生成进度', completedRooms: job.completedRooms, totalRooms: job.totalRooms,
          partialResult: job.cover || job.rooms?.length ? { cover: job.cover, rooms: job.rooms, failedRooms: job.failedRooms } : undefined,
        }).catch(() => undefined);
      };
      let result: Awaited<ReturnType<typeof resumeGenerationJob>>;
      try {
        result = await resumeGenerationJob(task.id, previous, reportProgress);
      } catch (error) {
        const remoteStatus = String(remote.status || '').toUpperCase();
        if (remoteStatus !== 'SUCCEEDED' || !previous.cover) throw error;
        result = { type: 'floorplan' as const, cover: previous.cover, analysis: previous.analysis, rooms: previous.rooms || [], jobId: task.id };
      }
      if (!isActive()) return;
      const generatedResults: ReportResult[] = [{ name: '全屋总览', imageUrl: result.cover }, ...result.rooms.map((room) => ({
        name: room.name, imageUrl: room.imageUrl, review: room.review,
        versions: [{ id: newId(), parentVersionId: null, imageUrl: room.imageUrl, instruction: '', createdAt: new Date().toISOString(), model: 'original-generation' }],
      }))];
      const existingVersion = project.versions.find((item) => item.taskId === task.id);
      if (existingVersion) {
        setGenerationJobId(task.id);
        setRooms(existingVersion.identifiedRooms || []);
        setSelectedRooms(existingVersion.selectedRooms || []);
        setResults([{ name: '全屋总览', imageUrl: existingVersion.coverImageUrl }, ...existingVersion.images.map((image) => ({ name: image.title, imageUrl: image.imageUrl }))]);
        setStage(3);
        setWorkKind(null);
        setMessage('方案已恢复并生成完成。');
        clearActiveGeneration(task.id);
        void clearRunningSnapshot(task.id).catch(() => undefined);
        return;
      }
      const completedAt = new Date().toISOString();
      const versionId = newId();
      const source = project.spaceType.startsWith('CAD') ? 'cad' : 'floorplan';
      const identifiedRooms: IdentifiedRoom[] = result.rooms.map((room) => ({ name: room.name, description: room.description, status: 'identified' }));
      const warning = result.warning;
      const version: DesignVersion = {
        id: versionId, mode: 'floorplan', style: task.style, prompt: task.prompt, createdAt: completedAt,
        analysis: result.analysis, coverImageUrl: result.cover,
        images: result.rooms.map((room) => ({ id: newId(), title: room.name, imageUrl: room.imageUrl, description: room.description })),
        taskId: task.id, source, floorPlanAnalysis: result.analysis, identifiedRooms, selectedRooms: identifiedRooms.map((room) => room.name), warning,
      };
      const nextTask: GenerationTask = { ...task, status: warning ? 'failed' : 'completed', stage: warning ? 'failed' : 'completed', completedAt, error: warning, result: { versionId, roomCount: result.rooms.length, coverReady: true } };
      await persistWorkspaceProject({
        ...project, updatedAt: completedAt, status: warning ? 'failed' : 'completed', thumbnail: result.cover,
        versions: [...project.versions, version], tasks: project.tasks.map((item) => item.id === task.id ? nextTask : item),
      });
      if (remoteStatus !== 'SUCCEEDED') {
        await finishPersistentGenerationTask(task.id, { cover: result.cover, rooms: version.images, analysis: result.analysis, warning, versionId }, version).catch(() => undefined);
      }
      if (!isActive()) return;
      setGenerationJobId(result.jobId || task.id);
      setRooms(identifiedRooms);
      setSelectedRooms(identifiedRooms.map((room) => room.name));
      setResults(generatedResults);
      setStage(3);
      setMessage(warning ? `部分效果图未完成：${warning}` : '方案已恢复并生成完成。');
      clearActiveGeneration(task.id);
      void clearRunningSnapshot(task.id).catch(() => undefined);
      const record: DesignHistoryRecord = {
        id: version.id, name: `${styleOptions.find((style) => style.key === task.style)?.name || task.style} · ${new Date(completedAt).toLocaleDateString('zh-CN')}`,
        createdAt: completedAt, style: task.style, source, floorPlan: project.floorPlanUrl || '', analysis: result.analysis,
        rooms: identifiedRooms, selectedRooms: identifiedRooms.map((room) => room.name), warning, generationJobId: result.jobId || task.id, results: generatedResults,
      };
      await saveDesignHistory(record).then(() => setHistory((current) => [record, ...current.filter((item) => item.id !== record.id)])).catch(() => undefined);
      await loadProjects();
    } catch (error) {
      if (isActive()) {
        const recoveryMessage = error instanceof Error ? `任务进度恢复失败：${error.message}` : '任务进度暂时无法恢复，请稍后重试。';
        setTaskRecoveryError(recoveryMessage);
        setMessage(recoveryMessage);
        setWorkKind(null);
      }
    } finally {
      if (recoveryTaskRef.current === task.id) recoveryTaskRef.current = null;
    }
  }, [loadProjects, requestedStyle, routeSourceType, setSelectedStyle]);

  useEffect(() => {
    const requestedProject = searchParams.get('projectId');
    const requestedTask = searchParams.get('taskId');
    if (!requestedProject || !requestedTask || !savedProjects.length) return;
    if (activeTaskRef.current === requestedTask) return;
    if (recoveredTaskRef.current.has(requestedTask)) return;
    const project = savedProjects.find((item) => item.id === requestedProject);
    const task = project?.tasks.find((item) => item.id === requestedTask);
    if (!project || !task || task.status === 'completed') return;
    recoveredTaskRef.current.add(requestedTask);
    let active = true;
    void recoverPersistentTask(project, task, () => active);
    return () => { active = false; };
  }, [recoverPersistentTask, searchParams, savedProjects]);

  // Reload recovery: the URL usually carries the ids, but when it does not (history
  // rewrite blocked, link opened in a new tab) fall back to the stored pointer.
  useEffect(() => {
    if (searchParams.get('taskId')) return;
    if (!savedProjects.length) return;
    const pointer = readActiveGeneration();
    if (!pointer) return;
    if (activeTaskRef.current === pointer.taskId) return;
    if (recoveredTaskRef.current.has(pointer.taskId)) return;
    if (!isActiveGenerationFresh(pointer)) { clearActiveGeneration(pointer.taskId); return; }
    const project = savedProjects.find((item) => item.id === pointer.projectId);
    const task = project?.tasks.find((item) => item.id === pointer.taskId);
    if (!project || !task || task.status !== 'generating') { clearActiveGeneration(pointer.taskId); return; }
    recoveredTaskRef.current.add(pointer.taskId);
    let active = true;
    void recoverPersistentTask(project, task, () => active);
    return () => { active = false; };
  }, [recoverPersistentTask, searchParams, savedProjects]);

  useEffect(() => {
    if (!workKind) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setWorkElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [workKind]);

  const selectFile = async (nextFile?: File) => {
    if (!nextFile) return;
    try { const { data, meta } = await readImage(nextFile); setFile({ name: nextFile.name, size: formatSize(nextFile.size), preview: data }); setImageData(data); setImageMeta(meta); setRooms([]); setSelectedRooms([]); setResults([]); setStage(1); setTaskRecoveryError(''); setMessage(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : '图片读取失败。'); }
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => { void selectFile(event.target.files?.[0]); event.target.value = ''; };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); };
  const runRecognition = async () => {
    if (!imageData) { setMessage('请先上传户型图片。'); return; }
    setWorkElapsed(0); setWorkKind('recognizing'); setGenerationProgress(null); setGenerationJobId(null); setTaskRecoveryError(''); setMessage('');
    const now = new Date().toISOString();
    const persistentProjectId = newId();
    let taskId = newId();
    let task: GenerationTask = { id: taskId, mode: 'floorplan', style: workflowStyle, prompt: `${sourceType} floor plan recognition and whole-home generation`, status: 'generating', stage: 'recognizing', startedAt: now };
    const project: Project = { id: persistentProjectId, name: `${activeStyle.name}全屋方案`, spaceType: sourceType === 'cad' ? 'CAD 全屋设计' : '户型图全屋设计', style: workflowStyle, createdAt: now, updatedAt: now, status: 'generating', floorPlanUrl: imageData, photoUrls: [], versions: [], tasks: [], materialIds: [] };
    let persistedProject: Project;
    try {
      persistedProject = await persistWorkspaceProject(project);
      const remoteTask = await createPersistentGenerationTask(persistentProjectId, { mode: 'floorplan', source: sourceType, style: workflowStyle, prompt: task.prompt, stage: 'queued' });
      if (remoteTask?.id && typeof remoteTask.id === 'string') taskId = remoteTask.id;
      task = { ...task, id: taskId };
      if (remoteTask) await startPersistentGenerationTask(taskId);
      persistedProject = { ...persistedProject, tasks: [task] };
      await persistWorkspaceProject(persistedProject);
      setProjectId(persistentProjectId);
      activeTaskRef.current = taskId;
      writeActiveGeneration({
        taskId, projectId: persistentProjectId,
        mode: hasPersistentWorkspaceSession() ? 'api' : 'local',
        style: workflowStyle, source: sourceType, startedAt: now, stage: 'recognizing', progress: 5,
      });
      // Keep the task id in the URL so a reload can find the run even before the
      // backend pointer is read back.
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('projectId', persistentProjectId);
        next.set('taskId', taskId);
        return next;
      }, { replace: true });
      await loadProjects();
    } catch (error) {
      setWorkKind(null);
      setMessage(error instanceof Error ? `项目初始化失败：${error.message}` : '项目初始化失败，请稍后重试。');
      return;
    }
    try {
      const result = await analyzeFloorPlan(imageData, sourceType, imageMeta || undefined);
      await updatePersistentGenerationTask(taskId, { stage: 'generating', progress: 20, message: '户型空间识别完成，正在准备全屋效果图', completedRooms: 0, totalRooms: result.rooms.length });
      const selected = result.rooms.map((room) => room.name);
      setRooms(result.rooms);
      setSelectedRooms(selected);
      patchActiveGeneration({ stage: 'generating', progress: 20 });
      if (!hasPersistentWorkspaceSession()) {
        void saveRunningSnapshot({
          id: taskId, taskId, projectId: persistentProjectId, style: workflowStyle, source: sourceType,
          floorPlan: imageData, analysis: result.analysis, rooms: result.rooms, selectedRooms: selected,
          stage: 'generating', progress: 20, completedRooms: 0, totalRooms: result.rooms.length,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
      setStage(2);
      task = { ...task, stage: 'generating' };
      persistedProject = { ...persistedProject, updatedAt: new Date().toISOString(), tasks: [task] };
      await persistWorkspaceProject(persistedProject).catch((error: unknown) => {
        console.warn('Could not persist the generation-stage checkpoint; continuing the active workflow.', error);
      });
      await generatePlan({ analysis: result.analysis, rooms: result.rooms, selectedRooms: selected }, taskId, persistedProject);
    }
    catch (error) {
      console.error('Floor-plan recognition failed:', error);
      setStage(1);
      setMessage(error instanceof Error ? `户型识别失败：${error.message}` : '户型识别失败，请检查图片后重试。');
      const failedTask = { ...task, status: 'failed' as const, stage: 'failed' as const, completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : '户型识别失败' };
      await failPersistentGenerationTask(taskId, failedTask.error || '户型识别失败').catch(() => undefined);
      await persistWorkspaceProject({ ...persistedProject, updatedAt: failedTask.completedAt, status: 'failed', tasks: [failedTask] }).then(loadProjects).catch(() => undefined);
    }
    finally { setWorkKind(null); if (activeTaskRef.current === taskId) activeTaskRef.current = null; }
  };
  const generatePlan = async (input: GenerationInput, taskId: string, baseProject: Project, context?: GenerationContext) => {
    const planImage = context?.floorPlan || imageData;
    const planSource = context?.source || sourceType;
    const planStyle = context?.style || workflowStyle;
    const planTemplate = styleOptions.find((style) => style.key === planStyle);
    if (!planImage) { setMessage('请先上传户型图片。'); setStage(1); return; }
    activeTaskRef.current = taskId;
    setWorkElapsed(0); setWorkKind('generating'); setGenerationProgress(null); setMessage(''); setResults([]); setStage(2);
    const sourcePrompt = planSource === 'cad' ? '输入来源为 CAD 导出的住宅平面图，严格参考图中墙体、门窗和尺寸标注。' : '输入来源为住宅户型图，严格参考图中可见的房间边界与空间连接。';
    const prompt = [sourcePrompt, planTemplate?.prompt, ...(planStyle === routeStyle ? preferences : []).map(([label, value]) => `${label}:${value}`), `户型识别结果：${input.analysis}`, `识别空间：${input.rooms.map((room) => `${room.name}${room.suggestedName ? `（候选：${room.suggestedName}）` : ''}（${room.description}；${room.evidence?.map((item) => item.detail).join('、') || '无额外可见证据'}）`).join('；')}`].filter(Boolean).join('。');
    try {
      const roomReferenceImages = await Promise.all(input.rooms.filter((room) => input.selectedRooms.includes(room.name) && room.bounds).map(async (room) => ({ name: room.name, image: await makeRoomReferenceCrop(planImage, room.bounds!) })));
      let progressQueue = Promise.resolve();
      const reportProgress = (job: GenerationJob) => {
        setGenerationProgress(job);
        const progress = 25 + Math.floor(70 * Math.min(1, job.completedRooms / Math.max(job.totalRooms, 1)));
        const now = Date.now();
        if (now - progressTrackerRef.current > 3000) {
          progressTrackerRef.current = now;
          patchActiveGeneration({
            stage: job.stage, progress, message: job.message,
            completedRooms: job.completedRooms, totalRooms: job.totalRooms,
          });
          if (!hasPersistentWorkspaceSession()) {
            void saveRunningSnapshot({
              id: taskId, taskId, projectId: baseProject.id, style: planStyle, source: planSource,
              floorPlan: planImage, analysis: input.analysis, rooms: input.rooms, selectedRooms: input.selectedRooms,
              stage: job.stage || 'generating', progress, message: job.message,
              completedRooms: job.completedRooms, totalRooms: job.totalRooms, updatedAt: new Date().toISOString(),
            }).catch(() => undefined);
          }
        }
        progressQueue = progressQueue.then(() => updatePersistentGenerationTask(taskId, {
          stage: job.stage || 'generating', progress, message: job.message || '正在生成空间效果图',
          completedRooms: job.completedRooms, totalRooms: job.totalRooms,
          partialResult: job.cover || job.rooms?.length ? { cover: job.cover, rooms: job.rooms, failedRooms: job.failedRooms } : undefined,
        })).catch((error: unknown) => console.warn('Could not persist generation progress:', error));
      };
      await updatePersistentGenerationTask(taskId, { stage: 'generating', progress: 25, message: '正在生成全屋总览和分空间效果图', completedRooms: 0, totalRooms: input.selectedRooms.length });
      const result = await generateDesign({ mode: 'floorplan', style: planStyle, templateId: planTemplate?.id, referenceAssetId: planTemplate?.referenceAssetId, prompt, floorPlan: planImage, imageMeta: context?.imageMeta || imageMeta || undefined, source: planSource, analysis: input.analysis, rooms: input.rooms, selectedRooms: input.selectedRooms, roomReferenceImages, taskId }, reportProgress);
      await progressQueue;
      if (result.type !== 'floorplan') throw new Error('返回结果类型不正确。');
      setGenerationJobId(result.jobId || null);
      const generatedResults: ReportResult[] = [{ name: '全屋总览', imageUrl: result.cover }, ...result.rooms.map((room) => {
        const originalVersion: RoomImageVersion = { id: newId(), parentVersionId: null, imageUrl: room.imageUrl, instruction: '', createdAt: new Date().toISOString(), model: 'original-generation' };
        return { name: room.name, imageUrl: room.imageUrl, review: room.review, versions: [originalVersion], currentVersionId: originalVersion.id };
      })];
      setResults(generatedResults);
      setMessage(result.warning ? `部分效果图未完成：${result.warning}` : '');
      setStage(3);
      clearActiveGeneration(taskId);
      void clearRunningSnapshot(taskId).catch(() => undefined);
      const completedAt = new Date().toISOString();
      const versionId = newId();
      const task: GenerationTask = { ...baseProject.tasks[0], status: result.warning ? 'failed' : 'completed', stage: result.warning ? 'failed' : 'completed', completedAt, error: result.warning, result: { versionId, roomCount: generatedResults.length - 1, coverReady: true } };
      const version: DesignVersion = { id: versionId, mode: 'floorplan', style: planStyle, prompt, createdAt: completedAt, analysis: result.analysis, coverImageUrl: result.cover, images: generatedResults.slice(1).map((item) => ({ id: newId(), title: item.name, imageUrl: item.imageUrl, description: input.rooms.find((room) => room.name === item.name)?.description })), taskId, source: planSource, floorPlanAnalysis: input.analysis, identifiedRooms: input.rooms, selectedRooms: input.selectedRooms, warning: result.warning };
      const storedProject = await persistWorkspaceProject({ ...baseProject, updatedAt: completedAt, status: 'generating', thumbnail: result.cover, versions: [...baseProject.versions, version], tasks: [{ ...task, status: 'generating', completedAt: undefined, error: undefined }] });
      const durableVersion = storedProject.versions.at(-1) || version;
      const taskResult = { cover: durableVersion.coverImageUrl, rooms: durableVersion.images, analysis: result.analysis, warning: result.warning, versionId };
      const snapshot = { ...durableVersion, id: versionId, taskId, mode: 'floorplan', style: planStyle, createdAt: completedAt };
      if (result.warning) await failPersistentGenerationTask(taskId, result.warning, taskResult, snapshot);
      else await finishPersistentGenerationTask(taskId, taskResult, snapshot);
      await persistWorkspaceProject({ ...storedProject, updatedAt: completedAt, status: result.warning ? 'failed' : 'completed', tasks: [task] });
      await loadProjects();
      const record: DesignHistoryRecord = {
        id: version.id, name: `${activeStyle.name} · ${new Date().toLocaleDateString('zh-CN')}`, createdAt: completedAt,
        style: planStyle, source: planSource, floorPlan: planImage, analysis: result.analysis, rooms: input.rooms, selectedRooms: input.selectedRooms, warning: result.warning, generationJobId: result.jobId, results: generatedResults,
      };
      setActiveHistoryId(record.id);
      try {
        await saveDesignHistory(record);
        setHistory((current) => [record, ...current]);
        setHistoryMessage('');
      } catch (error) {
        setHistoryMessage(error instanceof Error ? `本次方案已生成，但本地记录保存失败：${error.message}` : '本次方案已生成，但本地记录保存失败。');
      }
    } catch (error) {
      console.error('Whole-home generation failed:', error);
      setStage(1); setMessage(error instanceof Error ? '方案生成失败：' + error.message : '方案生成失败，请稍后重试。');
      clearActiveGeneration(taskId);
      void clearRunningSnapshot(taskId).catch(() => undefined);
      const completedAt = new Date().toISOString();
      const task: GenerationTask = { ...baseProject.tasks[0], status: 'failed', stage: 'failed', completedAt, error: error instanceof Error ? error.message : '方案生成失败' };
      await failPersistentGenerationTask(task.id, task.error || '方案生成失败', generationProgress ? { cover: generationProgress.cover, rooms: generationProgress.rooms, failedRooms: generationProgress.failedRooms } : undefined).catch(() => undefined);
      await persistWorkspaceProject({ ...baseProject, updatedAt: completedAt, status: 'failed', tasks: [task] }).then(loadProjects).catch(() => undefined);
    }
    finally { setWorkKind(null); }
  };
  useEffect(() => { generatePlanRef.current = generatePlan; });
  const retryFailedRooms = async () => {
    if (!generationJobId || !results[0]) return;
    const record = history.find((item) => item.id === activeHistoryId);
    const previous = { type: 'floorplan' as const, cover: results[0].imageUrl, analysis: record?.analysis || generationProgress?.analysis || '', rooms: results.slice(1).map(({ name, imageUrl, review }) => ({ name, imageUrl, description: rooms.find((room) => room.name === name)?.description || '', review })) };
    setWorkElapsed(0); setWorkKind('generating'); setMessage('');
    try {
      const updated = await retryGenerationRooms(generationJobId, previous, setGenerationProgress);
      const existing = new Set(results.slice(1).map((item) => item.name));
      const additions: ReportResult[] = updated.rooms.filter((room) => !existing.has(room.name)).map((room) => {
        const version: RoomImageVersion = { id: createId(), parentVersionId: null, imageUrl: room.imageUrl, instruction: '', createdAt: new Date().toISOString(), model: 'original-generation' };
        return { name: room.name, imageUrl: room.imageUrl, review: room.review, versions: [version], currentVersionId: version.id };
      });
      const nextResults = [...results, ...additions];
      setResults(nextResults);
      setMessage(updated.warning ? `部分效果图未完成：${updated.warning}` : '');
      if (record) {
        const nextRecord = { ...record, results: nextResults, warning: updated.warning };
        try {
          await saveDesignHistory(nextRecord);
          setHistory((current) => current.map((item) => item.id === record.id ? nextRecord : item));
          const project = savedProjects.find((item) => item.id === projectId);
          const version = project?.versions.find((item) => item.id === record.id);
          const task = project?.tasks.find((item) => item.id === generationJobId);
          if (project && version && task) {
            const completedAt = new Date().toISOString();
            const nextVersion: DesignVersion = {
              ...version,
              warning: updated.warning,
              images: nextResults.slice(1).map((item) => ({ id: newId(), title: item.name, imageUrl: item.imageUrl, description: rooms.find((room) => room.name === item.name)?.description })),
            };
            const nextTask: GenerationTask = { ...task, status: updated.warning ? 'failed' : 'completed', stage: updated.warning ? 'failed' : 'completed', completedAt, error: updated.warning };
            await persistWorkspaceProject({ ...project, updatedAt: completedAt, status: updated.warning ? 'failed' : 'completed', versions: project.versions.map((item) => item.id === version.id ? nextVersion : item), tasks: project.tasks.map((item) => item.id === task.id ? nextTask : item) });
            await loadProjects();
          }
        }
        catch (error) { setHistoryMessage(error instanceof Error ? `重试结果已显示，但记录保存失败：${error.message}` : '重试结果保存失败。'); }
      }
    } catch (error) { setMessage(error instanceof Error ? `空间重试失败：${error.message}` : '空间重试失败。'); }
    finally { setWorkKind(null); }
  };
  const openHistoryRecord = (record: DesignHistoryRecord) => {
    setActiveHistoryId(record.id);
    setStyleOverride({ route: requestedStyle, value: record.style });
    setSelectedStyle(record.style);
    setSourceOverride({ route: routeSourceType, value: record.source });
    setImageData(record.floorPlan);
    setImageMeta(null);
    setRooms(record.rooms);
    setSelectedRooms(record.selectedRooms);
    setResults(record.results);
    setGenerationJobId(record.generationJobId || null);
    setStage(4);
    setMessage(record.warning || '');
  };
  const roomVersions = (item: ReportResult, index: number): RoomImageVersion[] => item.versions?.length ? item.versions : [{ id: `${activeHistoryId || 'legacy'}-${index}-original`, parentVersionId: null, imageUrl: item.imageUrl, instruction: '', createdAt: history.find((record) => record.id === activeHistoryId)?.createdAt || '1970-01-01T00:00:00.000Z', model: 'original-generation' }];
  const saveRoomVersion = async (version: RoomImageVersion, index: number, restore = false) => {
    if (!activeHistoryId) throw new Error('当前方案记录尚未就绪，请重新打开方案后再编辑。');
    const record = history.find((item) => item.id === activeHistoryId);
    if (!record) throw new Error('未找到当前方案记录，未修改原图。');
    const updatedResults = [...results];
    const item = updatedResults[index + 1];
    if (!item) throw new Error('空间图已变化，请关闭编辑器后重试。');
    const versions = roomVersions(item, index);
    updatedResults[index + 1] = {
      ...item,
      imageUrl: version.imageUrl,
      versions: restore ? versions : [...versions, version],
      currentVersionId: version.id,
    };
    const updatedRecord = { ...record, results: updatedResults };
    await saveDesignHistory(updatedRecord);
    setResults(updatedResults);
    setHistory((current) => current.map((entry) => entry.id === activeHistoryId ? updatedRecord : entry));
  };
  const removeHistoryRecord = async (id: string) => {
    try {
      await deleteDesignHistory(id);
      setHistory((current) => current.filter((record) => record.id !== id));
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : '删除方案记录失败。');
    }
  };
  const reset = () => { clearActiveGeneration(); setFile(null); setImageData(''); setImageMeta(null); setRooms([]); setSelectedRooms([]); setResults([]); setGenerationProgress(null); setGenerationJobId(null); setTaskRecoveryError(''); setActiveHistoryId(null); setEditingRoomIndex(null); setStage(1); setMessage(''); };

  return <div className="workspace-page"><main className="workspace-main">
    <header className={`workspace-header ${stage === 4 ? 'report-workspace-header' : ''}`}><div><span className="workspace-eyebrow">{stage === 4 ? 'JIAN YI ZHUANG / WHOLE-HOME STUDY' : 'JIAN YI ZHUANG / DESIGN FLOW'}</span><h2>{stage === 1 ? sourceType === 'cad' ? 'CAD 图纸全屋渲染' : '户型图全屋设计' : stage === 2 ? taskRecoveryError ? '生成任务记录' : '正在识别并生成方案' : stage === 3 ? '方案已生成，等待查看' : `${activeStyle.name} · 整屋设计方案`}</h2>{stage < 4 && <p>{taskRecoveryError ? '任务状态与已完成结果已恢复。' : stage === 3 ? '方案已经生成并保存到当前浏览器，点击下方按钮进入完整汇报。' : sourceType === 'cad' ? '上传图纸、选择风格后，系统会自动识别空间并生成方案。' : '上传户型图、选择风格后，系统会自动识别空间并生成方案。'}</p>}</div><button className="reset-button" onClick={stage === 4 ? () => setStage(3) : reset}><Icon name="refresh" />{stage === 4 ? '返回预览' : '重新开始'}</button></header>
    {stage < 4 && searchParams.has('template') && <aside className="design-preferences"><span><strong>灵感参考已带入</strong><small>{styleOptions.find((style) => style.key === searchParams.get('style'))?.name}</small></span></aside>}
    {stage < 4 && !hasRouteTemplate && (budgetSnapshot
      ? <aside className="budget-banner" aria-label="预算快照">
          <span className="budget-banner-icon" aria-hidden>¥</span>
          <div className="budget-banner-copy">
            <strong>预算快照已带入</strong>
            <div className="budget-banner-facts">
              <span><i>装修面积</i><b>{budgetSnapshot.area}㎡</b></span>
              <span><i>装修档位</i><b>{budgetSnapshot.finishLabel}档</b></span>
              <span><i>参考区间</i><b>¥{budgetSnapshot.lowWan.toFixed(1)}–{budgetSnapshot.highWan.toFixed(1)} 万</b></span>
              {budgetSnapshot.budgetWan ? <span><i>计划预算</i><b>{budgetSnapshot.budgetWan} 万</b></span> : null}
              {budgetSnapshot.region ? <span><i>所在地区</i><b>{budgetSnapshot.region}</b></span> : null}
            </div>
          </div>
          <Link className="budget-banner-action" to="/budget">重新试算 →</Link>
        </aside>
      : <aside className="budget-banner budget-banner-empty" aria-label="预算提示">
          <span className="budget-banner-icon" aria-hidden>¥</span>
          <div className="budget-banner-copy">
            <strong>还没有预算参考</strong>
            <p>完成预算试算后，生成方案会自动带入面积与档位，并对照计划预算给出风格建议。</p>
          </div>
          <Link className="budget-banner-action" to="/budget">去试算预算 →</Link>
        </aside>)}
    {stage < 4 && <div className="workspace-stepper"><span className="workspace-stepper-label">全屋方案流程</span>{[['上传资料与风格', '图片 · 风格'], ['识别空间并生成', '户型 · 效果图'], ['查看生成结果', '预览 · 汇报']].map(([label, note], index) => <div className={`workspace-step ${stage === index + 1 ? 'active' : ''} ${stage > index + 1 ? 'done' : ''}`} key={label}><span className="step-index">{stage > index + 1 ? <Icon name="check" /> : `0${index + 1}`}</span><span><strong>{label}</strong><small>{note}</small></span></div>)}</div>}
    {stage < 4 && !isWorking && <div className="flow-content">
      {stage === 2 && taskRecoveryError && <section className="working-state recovery-state" role="status"><div className="working-state-topline"><span className="live-indicator" />任务状态</div><h3>本次生成未能继续</h3><p>{taskRecoveryError}</p>{results.length > 0 && <div className="working-results">{results.map((result) => <figure key={result.name}><img src={result.imageUrl} alt={result.name} /><figcaption>{result.name}</figcaption></figure>)}</div>}<div className="flow-actions"><button className="quiet-button" type="button" onClick={reset}>返回上传</button><button className="continue-button" type="button" onClick={reset}>重新上传并生成</button></div></section>}
      {stage === 1 && message && <div className="flow-message flow-message-error" role="alert">{message}{/积分不足|INSUFFICIENT/.test(message) && <Link className="flow-message-action" to="/subscription">去补充积分 →</Link>}</div>}
      {stage === 1 && <section className="flow-panel"><div className="panel-title"><span><b>01</b>上传资料并选择风格</span><small>{sourceType === 'cad' ? 'CAD 图纸导出图片' : '户型平面图图片'}</small></div><div className="source-tabs" role="tablist" aria-label="识别方案"><button type="button" role="tab" aria-selected={sourceType === 'cad'} className={sourceType === 'cad' ? 'active' : ''} onClick={() => { setSourceOverride({ route: routeSourceType, value: 'cad' }); setFile(null); setImageData(''); setMessage(''); }}><Icon name="file" /><span><strong>CAD 图纸全屋渲染</strong><small>DWG / DXF 导出为图片后上传</small></span></button><button type="button" role="tab" aria-selected={sourceType === 'floorplan'} className={sourceType === 'floorplan' ? 'active' : ''} onClick={() => { setSourceOverride({ route: routeSourceType, value: 'floorplan' }); setFile(null); setImageData(''); setMessage(''); }}><Icon name="upload" /><span><strong>户型图设计</strong><small>上传户型平面图图片</small></span></button></div><div className={`upload-zone ${file ? 'has-file' : ''}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === 'Enter') inputRef.current?.click(); }} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>{file ? <><span className="file-preview"><img src={file.preview} alt={sourceType === 'cad' ? 'CAD 平面图预览' : '户型图预览'} /></span><span className="file-info"><strong>{file.name}</strong><small>{file.size} · {sourceType === 'cad' ? 'CAD 平面图' : '户型图'}</small></span><button className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); setImageData(''); }} aria-label="移除文件"><Icon name="close" /></button></> : <><span className="upload-zone-icon"><Icon name="upload" /></span><strong>{sourceType === 'cad' ? '拖入 CAD 导出图，或点击选择图片' : '拖入户型图，或点击选择图片'}</strong><small>{sourceType === 'cad' ? 'DWG / DXF / PDF 请先导出为 PNG、JPG 或 WEBP' : '支持 PNG、JPG、WEBP 格式的户型平面图'}</small></>}<input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={handleChange} /></div><div className="panel-tip"><span>i</span>{sourceType === 'cad' ? '按 CAD 图纸的墙体、门窗和尺寸标注识别；目前请先导出为图片，暂不直接读取 DWG / DXF / PDF 文件。' : '识别户型图中的房间、门窗和空间动线；请上传清晰、完整的平面图。'}</div><div className="style-picker-heading"><div><strong>选择空间风格</strong><small>先定下全屋的色彩与材质方向，识别后可直接生成</small></div></div><div className="workspace-style-grid">{styleOptions.map((style) => <button type="button" key={style.key} aria-pressed={workflowStyle === style.key} className={`workspace-style-card ${workflowStyle === style.key ? 'selected' : ''}`} onClick={() => { setStyleOverride({ route: requestedStyle, value: style.key }); setSelectedStyle(style.key); }}><span className="workspace-style-image"><img src={style.image} alt={`${style.name}风格参考`} /></span><span className="workspace-style-meta"><strong>{style.name}</strong><small>{style.note}</small></span>{workflowStyle === style.key && <span className="style-check"><Icon name="check" /></span>}</button>)}</div><div className="upload-actions"><span className="style-current">当前风格：<strong>{activeStyle.name}</strong></span><button className="continue-button" onClick={() => void runRecognition()} disabled={isWorking || !imageData}>{isWorking ? <><span className="spinner" />正在识别…</> : <>识别户型空间 <Icon name="arrow" /></>}</button></div>{message && <p className="flow-message">{message}</p>}</section>}
      {stage === 3 && results.length > 0 && <section className="result-board generation-preview"><div className="result-board-head"><div><span className="panel-kicker">生成完成</span><h3>方案已经准备好</h3><p>结果已保存到当前浏览器，查看汇报前仍可回到工作区调整资料。</p></div><button className="continue-button" onClick={() => setStage(4)}>查看汇报方案 <Icon name="arrow" /></button></div><div className="result-cover"><img src={results[0].imageUrl} alt="全屋方案总览预览" /><div><span>全屋效果总览</span><strong>{activeStyle.name} · {selectedRooms.length} 个空间</strong></div></div><div className="result-room-grid">{results.slice(1).map((result) => <article key={result.name}><img src={result.imageUrl} alt={`${result.name}效果图预览`} /><div><strong>{result.name}</strong><small>空间效果已生成</small></div></article>)}</div><div className="flow-actions"><button className="quiet-button" onClick={() => setStage(1)}>重新上传资料</button><button className="continue-button" onClick={() => setStage(4)}>进入完整汇报 <Icon name="arrow" /></button></div>{message && <p className="flow-message">{message}</p>}</section>}
      {stage === 3 && generationJobId && message && <div className="retry-failed-rooms"><button className="quiet-button" type="button" onClick={() => void retryFailedRooms()}>重试未完成空间</button></div>}
    </div>}
    {stage === 1 && <section className="design-history" aria-label="历史生成方案"><div className="design-history-heading"><div><span>方案记录</span><h3>最近生成</h3></div><small>仅保存在当前浏览器</small></div>{historyMessage && <p className="history-message">{historyMessage}</p>}{history.length > 0 ? <div className="design-history-list">{history.map((record) => <article className="design-history-item" key={record.id}><button className="history-open" onClick={() => openHistoryRecord(record)}><img src={record.results[0]?.imageUrl} alt="" /><span><strong>{record.name}</strong><small>{new Date(record.createdAt).toLocaleString('zh-CN')} · {record.rooms.length} 个空间</small></span></button><button className="history-delete" aria-label={`删除${record.name}`} title="删除记录" onClick={() => void removeHistoryRecord(record.id)}>×</button></article>)}</div> : !historyMessage && <p className="history-empty">完成一份全屋方案后，会保存在这里，之后可继续查看。</p>}</section>}
    {isWorking && <section className={`working-state ${workKind === 'generating' ? 'generation-state' : ''}`} aria-live="polite">
      <div className="working-state-topline"><span className="live-indicator" />{workKind === 'recognizing' ? '户型识别' : '全屋方案生成'}<span className="working-elapsed">已等待 {workElapsed} 秒</span></div>
      <div className="loading-orbit"><span /><span /><span /></div>
      <h3>{workKind === 'recognizing' ? '正在读取户型空间' : '正在创作你的全屋方案'}</h3>
      <p>{workKind === 'recognizing' ? '正在分析图面中的空间、墙体与开口信息。' : generationProgress?.message || `已提交 ${activeStyle.name} 风格与 ${selectedRooms.length} 个空间。`}</p>
      <div className="working-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={livePercent}><span style={{ width: `${Math.max(4, livePercent)}%` }} /></div>
      <div className="working-timeline">
        <div className="working-timeline-item done"><span><Icon name="check" /></span><div><strong>{workKind === 'recognizing' ? '图片已接收' : '风格与空间要求已提交'}</strong><small>{workKind === 'recognizing' ? '已开始分析你上传的图纸' : `已选择 ${activeStyle.name} · ${selectedRooms.length} 个空间`}</small></div></div>
        <div className={`working-timeline-item ${workKind === 'generating' && generationProgress?.coverReady ? 'done' : 'active'}`}><span className={workKind === 'generating' && generationProgress?.coverReady ? '' : 'timeline-pulse'}>{workKind === 'generating' && generationProgress?.coverReady && <Icon name="check" />}</span><div><strong>{workKind === 'recognizing' ? '识别空间结构' : '生成全屋总览'}</strong><small>{workKind === 'recognizing' ? '整理可辨认房间与空间关系' : generationProgress?.coverReady ? '总览已完成' : '正在依据原图生成总览效果'}</small></div></div>
        {workKind === 'generating' && <div className={`working-timeline-item ${generationProgress?.coverReady ? 'active' : ''}`}><span className={generationProgress?.coverReady ? 'timeline-pulse' : ''} /><div><strong>生成与复核空间效果图</strong><small>已完成 {generationProgress?.completedRooms || 0}/{generationProgress?.totalRooms || selectedRooms.length} 个空间{generationProgress?.completedRoomNames?.length ? `：${generationProgress.completedRoomNames.join('、')}` : ''}</small></div></div>}
      </div>
      {workKind === 'generating' && (generationProgress?.cover || generationProgress?.rooms?.length) ? <div className="working-results" aria-label="已完成的效果图">
        {generationProgress.cover && <div className="working-result-item"><img src={generationProgress.cover} alt="已完成的全屋总览" /><small>全屋总览</small></div>}
        {generationProgress.rooms?.map((room) => <div className="working-result-item" key={room.name}><img src={room.imageUrl} alt={`${room.name}已完成`} /><small>{room.name}</small></div>)}
      </div> : null}
      {workKind === 'generating' && workElapsed >= 45 && <p className="working-long-wait">生成仍在进行。你可以先去「我的项目」，进度会保存在账号里，随时回来继续。</p>}
      <span className="working-disclaimer">进度按已完成空间估算，与模型实际耗时会有差异。</span>
    </section>}
    {stage === 4 && !isWorking && results.length > 0 && <div className="whole-home-report">
      {message && <div className="report-generation-warning" role="status">{message}{generationJobId && <button className="quiet-button" type="button" disabled={isWorking} onClick={() => void retryFailedRooms()}>重试未完成空间</button>}</div>}
      <nav className="report-nav" aria-label="汇报目录"><a href="#report-overview">方案概览</a><a href="#report-style">风格说明</a><a href="#report-board">全屋设计</a><a href="#report-rooms">空间方案</a><a href="#report-notes">设计考量</a><button className="report-history-return" onClick={() => setStage(1)}>返回方案记录</button><span><i />已生成方案</span></nav>
      <section className="report-hero" id="report-overview"><div className="report-hero-copy"><span className="report-kicker">全屋设计 · 方案概览</span><p className="report-title-style">{activeStyle.name}</p><h1>整屋设计方案</h1><p className="report-hero-summary">{activeStyle.details.subtitle}</p><div className="report-tags">{activeStyle.note.split(' · ').map((tag) => <span key={tag}>{tag}</span>)}</div><a className="report-primary-link" href="#report-rooms">浏览空间方案 <Icon name="arrow" /></a></div><figure className="report-plan-figure"><img src={imageData} alt="本方案对应的原始户型图" /><figcaption><span>原始户型依据</span><strong>{rooms.length} 个识别空间</strong></figcaption></figure></section>
      <div className="report-metrics"><span><strong>{selectedRooms.length}</strong><small>进入设计的空间</small></span><span><strong>{rooms.length - selectedRooms.length}</strong><small>保留识别空间</small></span><span><strong>{activeStyle.palette.length}</strong><small>全屋主色</small></span><span><strong>{activeStyle.materials.length}</strong><small>建议材质</small></span></div>
      <section className="report-section report-style-section" id="report-style"><div className="report-section-heading"><span>02</span><div><h4>全屋设计风格说明</h4><p>先建立统一的材质与色彩秩序，再让每个房间保留自己的功能性格。</p></div></div><div className="report-principles">{activeStyle.details.principles.map((item, index) => <article key={item.title}><small>0{index + 1}</small><strong>{item.title}</strong><p>{item.body}</p></article>)}</div><div className="report-materials"><div><strong>色彩关系</strong><div className="report-swatches">{activeStyle.palette.map((color) => <span key={color}><i style={{ background: color }} />{color}</span>)}</div></div><div><strong>材质方向</strong><p>{activeStyle.materials.join(' · ')}</p></div></div></section>
      <section className="report-section report-board-section" id="report-board"><div className="report-section-heading"><span>03</span><div><h4>整屋设计</h4><p>拖动分隔线，对照原始户型图与全屋渲染结果。</p></div></div><div className="design-board-grid"><article className="design-board-cover"><PlanComparison original={imageData} render={results[0].imageUrl} title="全屋" /><div><span>全屋效果总览</span><strong>{activeStyle.name} · 全屋方案</strong></div></article><article className="design-board-brief"><span>设计构想</span><h5>设计概念</h5><p>{activeStyle.analysis}</p><dl><div><dt>设计风格</dt><dd>{activeStyle.name}</dd></div><div><dt>空间范围</dt><dd>{selectedRooms.map((name) => name).join('、')}</dd></div><div><dt>户型依据</dt><dd>基于上传户型图及识别出的空间信息</dd></div></dl></article><article className="design-board-plan"><img src={imageData} alt="原始户型平面图" /><span>原始户型依据</span></article><article className="design-board-colors"><span>材质与色彩</span><h5>材质与色彩</h5><div className="report-swatches">{activeStyle.palette.map((color) => <span key={color}><i style={{ background: color }} />{color}</span>)}</div><p>{activeStyle.materials.join('、')}</p></article></div></section>
      <section className="report-section report-rooms-section" id="report-rooms"><div className="report-section-heading"><span>04</span><div><h4>沿着生活动线，逐间看方案</h4><p>空间命名和视角以识别证据为依据；低置信度内容保留待确认状态。</p></div></div><div className="report-room-list">{results.slice(1).map((item, index) => { const room = rooms.find((entry) => entry.name === item.name); return <article className="report-room" key={`${item.name}-${index}`}><button type="button" className="report-room-image" aria-label={`编辑${item.name}空间效果图`} onClick={() => setEditingRoomIndex(index)}><img src={item.imageUrl} alt={`${item.name}室内视角效果图`} /><span>{item.name} · 室内视角 · 点击局部编辑</span></button><div className="report-room-copy"><span className="report-kicker">{activeStyle.name} · 空间设计</span><h5>{item.name}</h5><p>{room?.description || `按户型中${item.name}所在位置与相邻空间关系设计。`}</p>{room?.suggestedName && <small>识别候选：{room.suggestedName}，功能尚未确认</small>}<small className={`room-review room-review-${item.review?.status || 'unverified'}`}>{item.review?.status === 'pass' ? '自动复核：未发现明显空间错配' : item.review?.status === 'check' ? `自动复核建议：${item.review.note}` : item.review?.note || '自动复核结果不可用，请人工对照原图核验'}</small><small>概念示意，非施工依据</small></div></article>; })}</div></section>
      <section className="report-section report-notes-section" id="report-notes"><div className="report-section-heading"><span>05</span><div><h4>落地前，需要确认的判断</h4><p>把识别与效果表达的边界说明清楚，便于继续深化。</p></div></div><div className="report-checks"><article><strong>01 / 图面核对</strong><p>房间边界、门窗及固定设施以原始户型图为依据；模糊信息需现场复核。</p></article><article><strong>02 / 尺寸复核</strong><p>效果图不代表精确尺寸，施工前需完成现场测量并核验通行与家具尺度。</p></article><article><strong>03 / 实施边界</strong><p>当前方案用于设计沟通，不替代施工图、材料封样、报价与工艺确认。</p></article></div><div className="report-room-register"><strong>本次户型识别</strong>{rooms.map((room) => <span key={room.name}>{room.name}</span>)}</div></section>
    </div>}
    {editingRoomIndex !== null && results[editingRoomIndex + 1] && (() => { const item = results[editingRoomIndex + 1]; const versions = roomVersions(item, editingRoomIndex); const currentVersionId = item.currentVersionId || versions[versions.length - 1].id; return <RoomImageEditor key={`${activeHistoryId}-${editingRoomIndex}`} roomName={item.name} imageUrl={item.imageUrl} versions={versions} currentVersionId={currentVersionId} onClose={() => setEditingRoomIndex(null)} onGenerate={(mask, instruction) => editRoomImage({ image: item.imageUrl, mask, instruction, roomName: item.name, style: activeStyle.name })} onAdopt={(version) => saveRoomVersion(version, editingRoomIndex)} onRestore={(version) => saveRoomVersion(version, editingRoomIndex, true)} />; })()}
  </main></div>;
}
