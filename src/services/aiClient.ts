import type { DesignStyle } from '../stores/appStore';
export type DesignMode = 'photo' | 'floorplan';
export type PhotoGeneration = { type: 'photo'; imageUrl: string; analysis: string };
export type RoomGeneration = { name: string; description: string; imageUrl: string; review?: { status: 'pass' | 'check' | 'unverified'; note: string } };
export type IdentifiedRoom = {
  id?: string;
  name: string;
  description: string;
  suggestedName?: string;
  confidence?: number | null;
  status?: 'confirmed' | 'identified' | 'unknown';
  evidence?: { type: string; detail: string }[];
  adjacentTo?: string[];
  bounds?: { x: number; y: number; width: number; height: number } | null;
};
export type FloorPlanAnalysis = { analysis: string; rooms: IdentifiedRoom[] };
export type FloorPlanGeneration = { type: 'floorplan'; cover: string; analysis: string; rooms: RoomGeneration[] };
export type GenerationResult = PhotoGeneration | FloorPlanGeneration;
export type PlanSource = 'cad' | 'floorplan';
export type PlanImageMeta = { sourceWidth: number; sourceHeight: number; sentWidth: number; sentHeight: number; sourceBytes: number };
export type GenerationJob = {
  id: string;
  requestId: string;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  stage: string;
  message: string;
  completedRooms: number;
  totalRooms: number;
  coverReady?: boolean;
  completedRoomNames?: string[];
  cover?: string;
  analysis?: string;
  rooms?: RoomGeneration[];
  failedRooms?: string[];
  error?: string;
};
const supportedImageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function toSupportedImageDataUrl(image: string): Promise<string> {
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(image)) return image;

  let blob: Blob;
  try {
    const response = await fetch(image);
    if (!response.ok) throw new Error(`图片读取失败（${response.status}）`);
    blob = await response.blob();
  } catch {
    throw new Error('原图无法读取，请重新打开方案后重试。');
  }

  const mimeType = blob.type.toLowerCase().split(';')[0];
  if (!supportedImageMimeTypes.has(mimeType)) {
    throw new Error('原图格式不支持，请使用 PNG、JPG 或 WEBP 图片。');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!/^data:image\/(png|jpeg|webp);base64,/i.test(result)) {
        reject(new Error('原图转换失败，请重新打开方案后重试。'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('原图转换失败，请重新打开方案后重试。'));
    reader.readAsDataURL(blob);
  });
}

export async function editRoomImage(input: { image: string; mask: string; instruction: string; roomName: string; style: string }): Promise<{ imageUrl: string; model: string }> {
  const image = await toSupportedImageDataUrl(input.image);
  const response = await fetch('/api/ai/edit-room-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, image }) });
  const payload = await response.json() as { imageUrl?: string; model?: string; error?: string };
  if (!response.ok || !payload.imageUrl) throw new Error(payload.error || '局部编辑失败，请稍后重试。');
  return { imageUrl: payload.imageUrl, model: payload.model || 'configured-image-model' };
}
export async function analyzeFloorPlan(floorPlan: string, source: PlanSource = 'floorplan', imageMeta?: PlanImageMeta): Promise<FloorPlanAnalysis> {
  const response = await fetch('/api/ai/analyze-floorplan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ floorPlan, source, imageMeta }) });
  const payload = await response.json() as FloorPlanAnalysis & { error?: string; requestId?: string };
  if (!response.ok) throw new Error([payload.error || '户型识别失败，请检查接口配置。', payload.requestId ? `请求编号：${payload.requestId}` : ''].filter(Boolean).join(' '));
  return payload;
}
export async function generateDesign(input: { mode: DesignMode; style: DesignStyle; prompt: string; templateId?: string; referenceAssetId?: string; photo?: string; photos?: string[]; floorPlan?: string; imageMeta?: PlanImageMeta; source?: PlanSource; analysis?: string; rooms?: IdentifiedRoom[]; selectedRooms?: string[]; roomReferenceImages?: { name: string; image: string }[]; taskId?: string }, onProgress?: (job: GenerationJob) => void): Promise<GenerationResult & { warning?: string; jobId?: string }> {
  const response = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  const payload = await response.json() as GenerationResult & { error?: string; jobId?: string };
  if (!response.ok) throw new Error(payload.error || 'AI 生成失败，请检查接口配置。');
  if (!payload.jobId) return payload;
  return pollGenerationJob(payload.jobId, input.analysis || '', onProgress);
}

export async function retryGenerationRooms(jobId: string, previous: FloorPlanGeneration, onProgress?: (job: GenerationJob) => void) {
  const response = await fetch(`/api/ai/generation-jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error || '空间重试暂不可用。');
  return pollGenerationJob(jobId, previous.analysis, onProgress, previous.rooms, previous.cover);
}

export async function resumeGenerationJob(jobId: string, previous: Partial<FloorPlanGeneration> = {}, onProgress?: (job: GenerationJob) => void) {
  return pollGenerationJob(jobId, previous.analysis || '', onProgress, previous.rooms || [], previous.cover || '');
}

async function pollGenerationJob(jobId: string, initialAnalysis: string, onProgress?: (job: GenerationJob) => void, previousRooms: RoomGeneration[] = [], previousCover = ''): Promise<FloorPlanGeneration & { warning?: string; jobId: string }> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  let notFoundSince: number | null = null;
  let receivedRooms = previousRooms.length;
  let includeCover = !previousCover;
  let cover = previousCover;
  let analysis = initialAnalysis;
  const rooms: RoomGeneration[] = [...previousRooms];
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    let job: GenerationJob;
    try {
      const query = new URLSearchParams({ summary: '1', afterRooms: String(receivedRooms), includeCover: includeCover ? '1' : '0' });
      const statusResponse = await fetch(`/api/ai/generation-jobs/${encodeURIComponent(jobId)}?${query}`, { cache: 'no-store' });
      if (statusResponse.status === 404) {
        notFoundSince ??= Date.now();
        if (Date.now() - notFoundSince < 60_000) continue;
        throw new Error('生成任务尚未登记或已过期，请稍后重试。');
      }
      if (!statusResponse.ok) throw new Error('暂时无法获取生成进度。');
      notFoundSince = null;
      job = await statusResponse.json() as GenerationJob;
      consecutiveErrors = 0;
    } catch (error) {
      if (++consecutiveErrors < 4) continue;
      throw error;
    }
    if (job.cover) { cover = job.cover; includeCover = false; }
    if (job.analysis) analysis = job.analysis;
    if (job.rooms?.length) { rooms.push(...job.rooms); receivedRooms += job.rooms.length; }
    onProgress?.({ ...job, cover: cover || undefined, analysis, rooms: [...rooms] });
    if (job.status === 'completed' || job.status === 'partial' || job.status === 'failed') {
      if (cover) return { type: 'floorplan', cover, analysis, rooms, jobId, warning: job.error ? `${job.error}（请求编号：${job.requestId}）` : undefined };
      throw new Error(`${job.error || '生成失败，请稍后重试。'}（任务编号：${job.requestId}）`);
    }
  }
  throw new Error(`生成任务等待超过 30 分钟，请记录任务编号 ${jobId} 并联系管理员排查。`);
}
